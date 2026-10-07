import { NextRequest, NextResponse } from "next/server";
import { listJobs } from "@/lib/repositories";
import { createQueuedJob } from "@/lib/jobs/ingest";
import { startJobScoring } from "@/lib/jobs/start-scoring";
import { z } from "zod";

const jobSchema = z.object({ company: z.string().min(1).max(160), title: z.string().min(1).max(200), location: z.string().min(1).max(200), sourceUrl: z.string().url().or(z.literal("")).optional(), jdText: z.string().min(40).max(100_000) });

export async function GET() {
  return NextResponse.json(await listJobs());
}

export async function POST(request: NextRequest) {
  const form = await request.formData();
  const parsed = jobSchema.safeParse(Object.fromEntries(form));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid job" }, { status: 400 });
  try {
    const job = await createQueuedJob({ ...parsed.data, sourceUrl: parsed.data.sourceUrl || null, source: "manual" }, "manual");
    try {
      const workflowRunId = await startJobScoring(job.id);
      return NextResponse.json({ id: job.id, scoringStatus: "queued", workflowRunId }, { status: 202 });
    } catch (error) {
      return NextResponse.json({
        id: job.id,
        scoringStatus: "failed",
        warning: error instanceof Error ? error.message : "Scoring workflow could not start",
      }, { status: 202 });
    }
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Could not save job" }, { status: 503 });
  }
}
