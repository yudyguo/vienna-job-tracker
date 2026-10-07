import { processApplicationMessage } from "@/lib/applications/service";
import { APPLICATION_MATCHER_VERSION } from "@/lib/applications/job-match";
import { isLikelyApplicationEmail } from "@/lib/email/classifier";
import { EMAIL_PARSER_VERSION } from "@/lib/email/parser";
import { fetchGmailMessageMetadata, fetchGmailMessageWithAuth, gmailAccess, listGmailMessages, parseGmailMessage } from "@/lib/gmail";
import { getSupabaseAdmin } from "@/lib/supabase/server";
import { FatalError } from "workflow";

export interface MailSyncWorkflowInput {
  runId: string;
  trigger: "scheduled" | "manual" | "backfill";
  backfillDays?: number;
  gmailQuery?: string;
}

function errorMessage(error: unknown) {
  if (error instanceof Error) return error.message;
  if (error && typeof error === "object" && "message" in error && typeof error.message === "string") return error.message;
  return "Mail sync workflow failed";
}

async function scanCandidateMetadata(input: MailSyncWorkflowInput) {
  "use step";
  const supabase = getSupabaseAdmin();
  if (!supabase) throw new Error("Supabase is not configured.");
  await supabase.from("mail_sync_runs").update({ status: "running" }).eq("id", input.runId);
  const startedAt = new Date();
  const { data: state } = await supabase.from("gmail_sync_state").select("last_scanned_at,initial_backfill_completed").eq("provider", "gmail").maybeSingle();
  const fallbackDays = Math.min(Math.max(input.backfillDays ?? 90, 1), 365);
  const cutoff = state?.last_scanned_at && state.initial_backfill_completed && input.trigger !== "backfill"
    ? new Date(new Date(state.last_scanned_at).getTime() - 2 * 60 * 60 * 1000)
    : new Date(startedAt.getTime() - fallbackDays * 24 * 60 * 60 * 1000);
  const scanLimit = input.trigger === "backfill" ? 5_000 : 2_000;
  let listed: Awaited<ReturnType<typeof listGmailMessages>>;
  try {
    const mailboxScope = input.gmailQuery
      ? `in:anywhere -in:spam -in:trash -in:sent {${input.gmailQuery}}`
      : input.trigger === "backfill"
      ? "in:anywhere -in:spam -in:trash -in:sent {subject:application subject:bewerbung subject:bewerbungsprozess subject:interview subject:offer subject:absage subject:assignment subject:assessment}"
      : "in:inbox";
    listed = await listGmailMessages(`${mailboxScope} after:${Math.floor(cutoff.getTime() / 1000)}`, scanLimit);
  } catch (error) {
    const message = errorMessage(error);
    if (message.includes("Gmail authorization expired")) throw new FatalError(message);
    throw error;
  }
  if (!listed.auth) throw new Error("Gmail is not connected.");
  const metadata = await fetchGmailMessageMetadata(listed.messages.map((message) => message.id));
  const candidates = metadata.filter((message) => {
    if (input.gmailQuery) return true;
    const parsed = parseGmailMessage(message);
    return isLikelyApplicationEmail(parsed.subject, parsed.from, message.snippet ?? "");
  }).sort((left, right) => Number(left.internalDate ?? 0) - Number(right.internalDate ?? 0));
  await supabase.from("mail_sync_runs").update({ scanned: metadata.length, candidates: candidates.length }).eq("id", input.runId);
  return { candidateIds: candidates.map((message) => message.id), scanned: metadata.length, startedAt: startedAt.toISOString() };
}

async function importCandidateMessages(candidateIds: string[]) {
  "use step";
  const supabase = getSupabaseAdmin();
  if (!supabase) throw new Error("Supabase is not configured.");
  const auth = await gmailAccess();
  if (!auth) throw new Error("Gmail is not connected.");
  const existing = new Map<string, string>();
  for (let index = 0; index < candidateIds.length; index += 500) {
    const { data, error } = await supabase.from("application_messages")
      .select("gmail_message_id,parser_version,matcher_version")
      .in("gmail_message_id", candidateIds.slice(index, index + 500));
    if (error) throw new Error(`Could not load existing application messages: ${error.message}`);
    for (const row of data ?? []) existing.set(String(row.gmail_message_id), `${row.parser_version}|${row.matcher_version ?? "legacy"}`);
  }
  let imported = 0;
  let updated = 0;
  let review = 0;
  const errors: string[] = [];
  for (const id of candidateIds) {
    if (existing.get(id) === `${EMAIL_PARSER_VERSION}|${APPLICATION_MATCHER_VERSION}`) continue;
    try {
      const message = await fetchGmailMessageWithAuth(auth, id, "full");
      if (!message) continue;
      const result = await processApplicationMessage(message);
      if (result.status === "imported") imported += 1;
      if (result.updated) updated += 1;
      if (result.review) review += 1;
    } catch (error) {
      errors.push(errorMessage(error));
    }
  }
  return { imported, updated, review, errors: errors.slice(0, 8) };
}

async function finishMailSync(input: MailSyncWorkflowInput, scan: { scanned: number; startedAt: string }, result: { imported: number; updated: number; review: number; errors: string[] }) {
  "use step";
  const supabase = getSupabaseAdmin();
  if (!supabase) throw new Error("Supabase is not configured.");
  const status = result.errors.length ? "partial" : "completed";
  await supabase.from("mail_sync_runs").update({
    status,
    imported: result.imported,
    updated_applications: result.updated,
    needs_review: result.review,
    error: result.errors.length ? result.errors.join("\n").slice(0, 4_000) : null,
    completed_at: new Date().toISOString(),
  }).eq("id", input.runId);
  await supabase.from("gmail_sync_state").upsert({
    provider: "gmail",
    last_scanned_at: scan.startedAt,
    initial_backfill_completed: input.trigger === "backfill" || input.backfillDays === 90 || undefined,
  }, { onConflict: "provider" });
  return { status, scanned: scan.scanned, imported: result.imported, updated: result.updated, review: result.review };
}

async function failMailSync(input: MailSyncWorkflowInput, message: string) {
  "use step";
  const supabase = getSupabaseAdmin();
  if (!supabase) return;
  await supabase.from("mail_sync_runs").update({
    status: "failed",
    error: message.slice(0, 4_000),
    completed_at: new Date().toISOString(),
  }).eq("id", input.runId);
}

export async function mailSyncWorkflow(input: MailSyncWorkflowInput) {
  "use workflow";
  try {
    const scan = await scanCandidateMetadata(input);
    const result = await importCandidateMessages(scan.candidateIds);
    return finishMailSync(input, scan, result);
  } catch (error) {
    await failMailSync(input, errorMessage(error));
    throw error;
  }
}
