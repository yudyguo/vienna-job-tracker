import "server-only";
import { fetchGmailMessage, gmailMessageToAlertJob } from "@/lib/gmail";
import { EMAIL_PARSER_VERSION, isCssContaminated } from "@/lib/email/parser";
import { ingestJob } from "@/lib/jobs/ingest";
import { getSupabaseAdmin } from "@/lib/supabase/server";

export async function rebuildGmailAlertJobs() {
  const supabase = getSupabaseAdmin();
  if (!supabase) throw new Error("Supabase is not configured.");
  const { data: sourceRows, error: sourceError } = await supabase
    .from("job_sources")
    .select("*, jobs!inner(*)")
    .eq("source_type", "gmail_job_alert");
  if (sourceError) throw new Error(`Could not load Gmail jobs: ${sourceError.message}`);
  const externalIds = [...new Set((sourceRows ?? []).map((row) => row.external_id).filter((id): id is string => Boolean(id)))];
  const oldJobIds = [...new Set((sourceRows ?? []).map((row) => String(row.job_id)))];
  if (!externalIds.length) return { rebuilt: 0, removed: 0, skipped: true };

  const { error: backupError } = await supabase.from("data_rebuild_backups").insert({
    kind: "gmail_job_rebuild_before",
    payload: { parserVersion: EMAIL_PARSER_VERSION, jobs: sourceRows, externalIds },
  });
  if (backupError) throw new Error(`Could not create rebuild backup: ${backupError.message}`);

  const staged = [];
  for (const externalId of externalIds) {
    const message = await fetchGmailMessage(externalId, "full");
    if (!message) continue;
    const job = gmailMessageToAlertJob(message);
    if (!job) continue;
    if (isCssContaminated(job.jdText)) throw new Error("Staged rebuild still contains CSS; no existing records were changed.");
    if (!job.company || !job.title || job.jdText.length < 30) throw new Error("Staged rebuild failed required-field validation; no existing records were changed.");
    if (/https?:\/\/|^(?:your job alert|see all jobs|view all jobs)/i.test(job.location) || job.location.length > 180) {
      throw new Error("Staged rebuild contains a polluted location; no existing records were changed.");
    }
    if (/https?:\/\//i.test(`${job.title} ${job.company}`) || job.title.length > 180 || job.company.length > 180) {
      throw new Error("Staged rebuild contains a polluted title or company; no existing records were changed.");
    }
    staged.push(job);
  }
  if (!staged.length) throw new Error("No clean Gmail jobs could be staged; no existing records were changed.");

  const newIds = new Set<string>();
  for (const raw of staged) {
    const oldSource = (sourceRows ?? []).find((row) => row.external_id === raw.externalId);
    const oldJob = oldSource?.jobs as unknown as Record<string, unknown> | undefined;
    const rebuilt = await ingestJob(raw, "gmail_rebuild");
    newIds.add(rebuilt.id);
    if (oldJob?.listing_status === "closed") {
      await supabase.from("jobs").update({ listing_status: "closed", listing_status_source: oldJob.listing_status_source, listing_closed_at: oldJob.listing_closed_at, listing_checked_at: oldJob.listing_checked_at }).eq("id", rebuilt.id);
    }
  }

  let removed = 0;
  let preserved = 0;
  for (const oldJobId of oldJobIds) {
    if (newIds.has(oldJobId)) continue;
    const [{ count: applicationCount }, { count: materialCount }] = await Promise.all([
      supabase.from("applications").select("id", { count: "exact", head: true }).eq("job_id", oldJobId),
      supabase.from("materials").select("id", { count: "exact", head: true }).eq("job_id", oldJobId),
    ]);
    if ((applicationCount ?? 0) > 0 || (materialCount ?? 0) > 0) {
      preserved += 1;
      continue;
    }
    const { error } = await supabase.from("jobs").delete().eq("id", oldJobId);
    if (error) throw new Error(`Could not remove obsolete Gmail job: ${error.message}`);
    removed += 1;
  }
  return { staged: staged.length, rebuilt: newIds.size, removed, preserved, parserVersion: EMAIL_PARSER_VERSION };
}
