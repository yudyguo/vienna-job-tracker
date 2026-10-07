import "server-only";
import { getSupabaseAdmin } from "@/lib/supabase/server";
import type { ApplicationMessage, ApplicationProcessKind, ApplicationStage } from "@/lib/types";

type MessageStepInput = Pick<ApplicationMessage, "classification" | "subject" | "bodyText" | "receivedAt" | "nextAction" | "nextActionAt">;

const roundPatterns: Array<[number, RegExp]> = [
  [1, /\b(?:1st|first)\b|\berste[rsn]?\b|erstgespräch/i],
  [2, /\b(?:2nd|second)\b|\bzweite[rsn]?\b/i],
  [3, /\b(?:3rd|third)\b|\bdritte[rsn]?\b/i],
  [4, /\b(?:4th|fourth)\b|\bvierte[rsn]?\b/i],
];

function detectRound(text: string) {
  return roundPatterns.find(([, pattern]) => pattern.test(text))?.[0] ?? null;
}

export function inferMessageProcessStep(message: MessageStepInput) {
  const text = `${message.subject}\n${message.nextAction ?? ""}\n${message.bodyText.slice(0, 4_000)}`;
  const roundNumber = detectRound(text);
  let kind: ApplicationProcessKind;
  if (message.classification === "acknowledgement") kind = "applied";
  else if (message.classification === "task") kind = "task";
  else if (message.classification === "offer") kind = "offer";
  else if (message.classification === "rejection") kind = "rejection";
  else if (message.classification === "interview" && /\bfinal\b|finale|finalrunde|letzte runde/i.test(text)) kind = "final_interview";
  else if (message.classification === "interview" && /screen|erstgespräch|telefoninterview|phone interview|intro call|kennenlernen/i.test(text)) kind = "screening";
  else if (message.classification === "interview") kind = "interview";
  else kind = "other";
  return {
    kind,
    roundNumber,
    title: message.subject,
    occurredAt: message.receivedAt,
    scheduledAt: message.nextActionAt ?? null,
  };
}

function stageKind(stage: ApplicationStage): ApplicationProcessKind {
  if (stage === "applied") return "applied";
  if (stage === "interview") return "interview";
  if (stage === "task") return "task";
  if (stage === "offer") return "offer";
  if (stage === "rejected") return "rejection";
  return "status_change";
}

export async function recordMessageProcessStep(input: {
  applicationId: string;
  messageId: string;
  message: MessageStepInput;
  source: string;
  metadata?: Record<string, unknown>;
}) {
  const supabase = getSupabaseAdmin();
  if (!supabase) return;
  const step = inferMessageProcessStep(input.message);
  const payload = {
    application_id: input.applicationId,
    application_message_id: input.messageId,
    kind: step.kind,
    round_number: step.roundNumber,
    title: step.title,
    occurred_at: step.occurredAt,
    scheduled_at: step.scheduledAt,
    source: input.source,
    metadata: input.metadata ?? {},
  };
  const { data: existing, error: lookupError } = await supabase.from("application_process_steps")
    .select("id")
    .eq("application_message_id", input.messageId)
    .maybeSingle();
  if (lookupError) throw new Error(`Could not inspect application process step: ${lookupError.message}`);
  const operation = existing
    ? supabase.from("application_process_steps").update(payload).eq("id", existing.id)
    : supabase.from("application_process_steps").insert(payload);
  const { error } = await operation;
  if (error) throw new Error(`Could not record application process step: ${error.message}`);
}

export async function recordManualProcessStep(input: {
  applicationId: string;
  eventId: string;
  fromStage: ApplicationStage;
  toStage: ApplicationStage;
  occurredAt: string;
  note?: string | null;
}) {
  const supabase = getSupabaseAdmin();
  if (!supabase) return;
  const { error } = await supabase.from("application_process_steps").insert({
    application_id: input.applicationId,
    application_event_id: input.eventId,
    kind: stageKind(input.toStage),
    title: `${input.fromStage} → ${input.toStage}`,
    occurred_at: input.occurredAt,
    source: "manual",
    notes: input.note ?? null,
    metadata: { fromStage: input.fromStage, toStage: input.toStage },
  });
  if (error && error.code !== "23505") throw new Error(`Could not record manual process step: ${error.message}`);
}
