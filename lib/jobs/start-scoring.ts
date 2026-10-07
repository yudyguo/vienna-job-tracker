import "server-only";
import { start } from "workflow/api";
import { getSupabaseAdmin } from "@/lib/supabase/server";
import { scoreJobWorkflow } from "@/workflows/score-job-workflow";

export async function startJobScoring(jobId: string) {
  const supabase = getSupabaseAdmin();
  if (!supabase) throw new Error("Supabase is not configured.");
  try {
    const run = await start(scoreJobWorkflow, [jobId]);
    const { error } = await supabase
      .from("jobs")
      .update({ scoring_workflow_run_id: run.runId })
      .eq("id", jobId);
    if (error) throw new Error(error.message);
    return run.runId;
  } catch (error) {
    const message = error instanceof Error ? error.message : "Scoring workflow could not start";
    await supabase
      .from("jobs")
      .update({ scoring_status: "failed", scoring_error: message.slice(0, 1_000), scoring_completed_at: new Date().toISOString() })
      .eq("id", jobId);
    throw error;
  }
}
