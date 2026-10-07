import { FatalError } from "workflow";
import { ingestJob } from "@/lib/jobs/ingest";
import { getSupabaseAdmin } from "@/lib/supabase/server";

async function scoreQueuedJob(jobId: string) {
  "use step";
  const supabase = getSupabaseAdmin();
  if (!supabase) throw new FatalError("Supabase is not configured.");
  const startedAt = new Date().toISOString();
  const { data: row, error } = await supabase
    .from("jobs")
    .update({ scoring_status: "scoring", scoring_error: null, scoring_started_at: startedAt, scoring_completed_at: null })
    .eq("id", jobId)
    .select("company,title,location,jd_text,jd_quality,parser_version,source,source_url,published_at")
    .single();
  if (error || !row) throw new FatalError(error?.message ?? "Queued job not found.");
  try {
    const result = await ingestJob({
      company: String(row.company),
      title: String(row.title),
      location: String(row.location),
      jdText: String(row.jd_text ?? ""),
      source: String(row.source ?? "manual"),
      sourceUrl: row.source_url == null ? null : String(row.source_url),
      publishedAt: row.published_at == null ? null : String(row.published_at),
      jdQuality: (row.jd_quality as "full" | "summary" | "missing") ?? "full",
      parserVersion: row.parser_version == null ? null : String(row.parser_version),
    }, "manual_scoring_workflow");
    return { id: result.id, score: Number(result.score) };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Job scoring failed.";
    if (/schema validation|invalid json|empty response|status 40[0-3]/i.test(message)) throw new FatalError(message);
    throw error;
  }
}

async function markScoringFailed(jobId: string, message: string) {
  "use step";
  const supabase = getSupabaseAdmin();
  if (!supabase) return;
  await supabase
    .from("jobs")
    .update({ scoring_status: "failed", scoring_error: message.slice(0, 1_000), scoring_completed_at: new Date().toISOString() })
    .eq("id", jobId);
}

export async function scoreJobWorkflow(jobId: string) {
  "use workflow";
  try {
    const result = await scoreQueuedJob(jobId);
    return { status: "completed", ...result };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Job scoring failed.";
    await markScoringFailed(jobId, message);
    return { status: "failed", id: jobId, error: message };
  }
}
