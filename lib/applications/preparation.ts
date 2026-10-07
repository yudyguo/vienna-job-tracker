import "server-only";
import { deepSeekProvider, PREPARATION_PROMPT_VERSION } from "@/lib/ai/deepseek-provider";
import { listCandidateFacts } from "@/lib/candidate-facts";
import { env } from "@/lib/env";
import { dbJobToJob } from "@/lib/jobs/ingest";
import { getSupabaseAdmin } from "@/lib/supabase/server";
import type { ApplicationStage, PreparationPackContent } from "@/lib/types";

function packKind(stage: ApplicationStage) {
  return stage === "interview" || stage === "task" || stage === "offer" ? stage : "general";
}

export async function generatePreparationPack(applicationId: string, auditSource = "manual") {
  const supabase = getSupabaseAdmin();
  if (!supabase) throw new Error("Supabase is not configured.");
  const { data: application, error } = await supabase
    .from("applications")
    .select("*, jobs!inner(*)")
    .eq("id", applicationId)
    .single();
  if (error) throw new Error(`Could not load application: ${error.message}`);
  const job = dbJobToJob(application.jobs as Record<string, unknown>);
  const { data: messageRows } = await supabase
    .from("application_messages")
    .select("subject,body_text,next_action,next_action_at,received_at")
    .eq("application_id", applicationId)
    .order("received_at", { ascending: false })
    .limit(5);
  const emailContext = (messageRows ?? []).map((message) => [message.subject, message.next_action, message.next_action_at, message.body_text].filter(Boolean).join("\n")).join("\n\n").slice(0, 30_000);
  const facts = await listCandidateFacts();
  const verified = facts.filter((fact) => fact.verified);
  let content: PreparationPackContent;
  let status: "draft" | "needs_jd" = "needs_jd";
  if (job.jdQuality === "full" && env.DEEPSEEK_API_KEY) {
    content = await deepSeekProvider.generatePreparationPack(job, verified, emailContext);
    const allowed = new Set(verified.map((fact) => fact.id));
    const invalid = content.starStories.flatMap((story) => story.factIds).filter((id) => !allowed.has(id));
    if (invalid.length) throw new Error(`Preparation pack cited unverified CandidateFact IDs: ${[...new Set(invalid)].join(", ")}`);
    status = "draft";
  } else {
    content = {
      summary: job.jdQuality === "full" ? "Preparation framework created from verified candidate facts; AI generation is unavailable." : "Email logistics and verified story frames are ready. Add the complete JD to generate role-specific preparation.",
      logistics: (messageRows ?? []).flatMap((message) => [message.next_action, message.next_action_at ? `Deadline or event: ${message.next_action_at}` : null]).filter((value): value is string => Boolean(value)),
      assessmentAreas: [],
      starStories: verified.filter((fact) => fact.category === "experience" || fact.category === "project").slice(0, 6).map((fact) => ({ title: fact.label, outline: `${fact.value}. ${fact.evidence}`, factIds: [fact.id] })),
      likelyQuestions: [],
      questionsToAsk: ["What outcome would define success in the first 90 days?", "Which team and stakeholders will this role work with most closely?"],
      risks: job.jdQuality === "full" ? [] : ["Complete JD is missing; role-specific preparation is intentionally limited."],
      checklist: ["Confirm time, timezone and meeting link", "Review the latest email", "Add the complete JD if available"],
    };
  }
  const kind = packKind(application.status as ApplicationStage);
  const { data: pack, error: packError } = await supabase.from("preparation_packs").upsert({ application_id: applicationId, kind }, { onConflict: "application_id" }).select("id").single();
  if (packError) throw new Error(`Could not create preparation pack: ${packError.message}`);
  const { data: latest } = await supabase.from("preparation_pack_versions").select("version").eq("preparation_pack_id", pack.id).order("version", { ascending: false }).limit(1).maybeSingle();
  const factIds = [...new Set(content.starStories.flatMap((story) => story.factIds))];
  const { data: version, error: versionError } = await supabase.from("preparation_pack_versions").insert({
    preparation_pack_id: pack.id,
    version: Number(latest?.version ?? 0) + 1,
    status,
    content_json: content,
    fact_ids: factIds,
    model: status === "draft" ? env.DEEPSEEK_QUALITY_MODEL : null,
    prompt_version: PREPARATION_PROMPT_VERSION,
    audit_source: auditSource,
  }).select("id,version,status").single();
  if (versionError) throw new Error(`Could not version preparation pack: ${versionError.message}`);
  return version;
}
