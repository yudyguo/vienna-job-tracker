import "server-only";
import { start } from "workflow/api";
import { getSupabaseAdmin } from "@/lib/supabase/server";
import { dailyJobWorkflow } from "@/workflows/daily-job-workflow";
import { viennaClock } from "@/lib/time";
import { mailSyncWorkflow } from "@/workflows/mail-sync-workflow";

export async function startDailyAutomation(trigger: "scheduled" | "manual", now = new Date()) {
  const supabase = getSupabaseAdmin();
  if (!supabase) throw new Error("Supabase is not configured.");
  const clock = viennaClock(now);
  if (trigger === "scheduled" && (clock.hour !== 7 || clock.minute !== 30)) return { skipped: true, reason: "Outside Vienna 07:30 window", localDate: clock.localDate };
  const { data: record, error } = await supabase.from("automation_runs").insert({ local_date: clock.localDate, trigger, status: "queued" }).select("id").single();
  if (error) {
    if (error.code === "23505" && trigger === "scheduled") return { skipped: true, reason: "Already started for local date", localDate: clock.localDate };
    throw new Error(error.message);
  }
  try {
    const run = await start(dailyJobWorkflow, [{ runId: record.id, localDate: clock.localDate, trigger }]);
    await supabase.from("automation_runs").update({ workflow_run_id: run.runId }).eq("id", record.id);
    return { skipped: false, runId: record.id, workflowRunId: run.runId, localDate: clock.localDate };
  } catch (error) {
    await supabase.from("automation_runs").update({ status: "failed", error: error instanceof Error ? error.message : "Workflow start failed", completed_at: new Date().toISOString() }).eq("id", record.id);
    throw error;
  }
}

export async function startMailSyncAutomation(trigger: "scheduled" | "manual" | "backfill", backfillDays?: number, gmailQuery?: string) {
  const supabase = getSupabaseAdmin();
  if (!supabase) throw new Error("Supabase is not configured.");
  const { data: record, error } = await supabase.from("mail_sync_runs").insert({ trigger, status: "queued", metadata: { backfillDays: backfillDays ?? null, targeted: Boolean(gmailQuery) } }).select("id").single();
  if (error) throw new Error(error.message);
  try {
    const run = await start(mailSyncWorkflow, [{ runId: record.id, trigger, backfillDays, gmailQuery }]);
    await supabase.from("mail_sync_runs").update({ workflow_run_id: run.runId }).eq("id", record.id);
    return { runId: record.id, workflowRunId: run.runId };
  } catch (error) {
    await supabase.from("mail_sync_runs").update({ status: "failed", error: error instanceof Error ? error.message : "Workflow start failed", completed_at: new Date().toISOString() }).eq("id", record.id);
    throw error;
  }
}
