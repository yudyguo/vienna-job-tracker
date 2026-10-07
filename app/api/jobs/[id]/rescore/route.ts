import { NextResponse } from "next/server";
import { getJob } from "@/lib/repositories";
import { getSupabaseAdmin } from "@/lib/supabase/server";
import { startJobScoring } from "@/lib/jobs/start-scoring";

export async function POST(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const job = await getJob(id);
  if (!job) return NextResponse.json({ error: "Job not found" }, { status: 404 });
  const supabase = getSupabaseAdmin();
  if (!supabase) return NextResponse.json({ error: "Supabase is not configured" }, { status: 503 });
  const { error } = await supabase.from("jobs").update({
    scoring_status: "queued",
    scoring_error: null,
    scoring_started_at: null,
    scoring_completed_at: null,
    audit_source: "manual_rescore",
  }).eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  try {
    const workflowRunId = await startJobScoring(id);
    return NextResponse.json({ id, scoringStatus: "queued", workflowRunId }, { status: 202 });
  } catch (startError) {
    return NextResponse.json({ error: startError instanceof Error ? startError.message : "Could not restart scoring" }, { status: 503 });
  }
}
