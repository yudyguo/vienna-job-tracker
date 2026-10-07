import "server-only";
import { createHash } from "node:crypto";
import { deepSeekProvider } from "@/lib/ai/deepseek-provider";
import { classifyApplicationEmail as classifyHeuristically, classificationToStage, isApplicationNoise, isConfirmedAcknowledgement, shouldAdvanceStage } from "@/lib/email/classifier";
import { gmailWebUrl } from "@/lib/email/parser";
import { env } from "@/lib/env";
import { getSupabaseAdmin } from "@/lib/supabase/server";
import type { GmailMessage } from "@/lib/gmail";
import { parseGmailMessage } from "@/lib/gmail";
import type { ApplicationStage } from "@/lib/types";
import { generatePreparationPack } from "@/lib/applications/preparation";
import { recordManualProcessStep, recordMessageProcessStep } from "@/lib/applications/process-steps";
import { APPLICATION_MATCHER_VERSION, isPlatformCompany, normalizeCompany, normalizeJobTitle, selectExistingJobMatch, selectPlaceholderCompanyMatch } from "@/lib/applications/job-match";

function cleanIdentity(value?: string | null) {
  const cleaned = value?.replace(/\s+/g, " ").replace(/^(?:the )?(?:position|role|stelle)(?: of| als)?\s+/i, "").trim().replace(/[.,;:–—-]+$/, "").slice(0, 180) || null;
  return cleaned && !/^(?:a |the |die |eine )?(?:position|role|stelle|job)(?: of)?$/i.test(cleaned) ? cleaned : null;
}

function inferIdentity(subject: string, senderName: string | null, senderEmail: string, body: string) {
  const titleFromSubject = [
    /(?:application (?:for|to)|bewerbung (?:als|für))\s*[:–—-]?\s*(.+?)(?:\s+(?:at|bei)\s+|$)/i,
    /(?:job application|bewerbung)\s*[:–—-]\s*(.+?)(?:\s+(?:at|bei)\s+|$)/i,
    /(?:bewerbungsprozess|bewerbung).{0,60}(?:stelle|position) als\s+(.+?)$/i,
  ].map((pattern) => subject.match(pattern)?.[1]).find(Boolean);
  const titleFromBody = [
    /(?:application|interest) (?:for|in) (?:the )?(?:position|role) (?:of )?([^\n.!?]{2,180})/i,
    /(?:applied|applying) for (?:the )?([^\n.!?]{2,180}?)(?: position| role)?(?: at| with|$)/i,
    /(?:registered|received) your (?:interest|application) (?:in|for) ([^\n.!?]{2,180}?)(?: at| with|$)/i,
    /bewerbung (?:als|für die (?:position|stelle))\s*([^\n.!?]{2,180}?)(?: bei| an|$)/i,
  ].map((pattern) => body.match(pattern)?.[1]).find(Boolean);
  const title = cleanIdentity(titleFromSubject ?? titleFromBody);
  const companyFromSubject = subject.match(/\s+(?:at|bei)\s+(.+?)(?:\s*[|–—-]|$)/i)?.[1]?.trim() ?? null;
  const companyFromBody = [
    /(?:position|role|stelle) (?:at|bei)\s+([^\n.!?]{2,120})/i,
    /(?:applying|applied|bewerbung) (?:for|für|als).*?\s+(?:at|bei)\s+([^\n.!?]{2,120})/i,
    /thank you for applying to\s+([^\n.!?]{2,120})/i,
  ].map((pattern) => body.match(pattern)?.[1]?.trim()).find(Boolean) ?? null;
  const cleanedSenderCompany = senderName
    ?.replace(/\s*[-–—|]?\s*(?:talent acquisition|recruiting|recruitment|people|careers?|jobs?)\s*(?:team)?\s*$/i, "")
    .trim();
  const senderCompany = cleanedSenderCompany && !/^(?:team|no.?reply|talent|recruiting|recruitment)$/i.test(cleanedSenderCompany)
    ? cleanedSenderCompany
    : senderEmail.split("@")[1]?.split(".")[0] ?? null;
  return { title, company: companyFromSubject ?? companyFromBody ?? senderCompany };
}

async function matchExistingJob(input: { threadId?: string; title?: string | null; company?: string | null; senderEmail?: string | null; receivedAt?: string | null }) {
  const supabase = getSupabaseAdmin();
  if (!supabase) throw new Error("Supabase is not configured.");
  const { data: jobs, error } = await supabase.from("jobs").select("id,title,company,source,published_at,applications(id)").is("merged_into_job_id", null).limit(500);
  if (error) throw new Error(`Could not match application email: ${error.message}`);
  if (input.threadId) {
    const { data } = await supabase.from("application_messages").select("applications!inner(job_id)").eq("gmail_thread_id", input.threadId).limit(1).maybeSingle();
    const application = data?.applications as unknown as Record<string, unknown> | undefined;
    const threadedJob = (jobs ?? []).find((job) => String(job.id) === String(application?.job_id));
    if (threadedJob) {
      const companyCompatible = !input.company || normalizeCompany(input.company) === normalizeCompany(String(threadedJob.company));
      const titleCompatible = !input.title || normalizeJobTitle(input.title) === normalizeJobTitle(String(threadedJob.title));
      if (companyCompatible && titleCompatible) return { jobId: String(threadedJob.id), confidence: 1, reason: "thread" as const };
    }
  }
  const realMatch = selectExistingJobMatch({
    title: input.title,
    company: input.company,
    receivedAt: input.receivedAt,
    jobs: (jobs ?? []).map((job) => ({
      id: String(job.id),
      title: String(job.title),
      company: String(job.company),
      source: job.source == null ? null : String(job.source),
      publishedAt: job.published_at == null ? null : String(job.published_at),
      hasApplication: Array.isArray(job.applications) ? job.applications.length > 0 : Boolean(job.applications),
    })),
  });
  if (realMatch) return realMatch;
  const company = normalizeCompany(input.company);
  const title = normalizeJobTitle(input.title);
  if (company && input.senderEmail && input.receivedAt) {
    const placeholderJobs = (jobs ?? []).filter((job) => job.source === "gmail_application"
      && normalizeCompany(String(job.company)) === company
      && !normalizeJobTitle(String(job.title)));
    const applicationToJob = new Map<string, string>();
    for (const job of placeholderJobs) {
      const applications = Array.isArray(job.applications) ? job.applications as Array<{ id?: unknown }> : [];
      for (const application of applications) {
        if (application.id) applicationToJob.set(String(application.id), String(job.id));
      }
    }
    const applicationIds = [...applicationToJob.keys()];
    if (applicationIds.length) {
      const { data: messages, error: messageError } = await supabase.from("application_messages")
        .select("application_id,sender_email,received_at")
        .in("application_id", applicationIds);
      if (messageError) throw new Error(`Could not inspect placeholder messages: ${messageError.message}`);
      const placeholderMatch = selectPlaceholderCompanyMatch({
        title: input.title,
        company: input.company,
        senderEmail: input.senderEmail,
        receivedAt: input.receivedAt,
        jobs: placeholderJobs.map((job) => ({
          id: String(job.id),
          title: String(job.title),
          company: String(job.company),
          source: String(job.source),
          applicationMessages: (messages ?? [])
            .filter((message) => applicationToJob.get(String(message.application_id)) === String(job.id))
            .map((message) => ({ senderEmail: String(message.sender_email), receivedAt: String(message.received_at) })),
        })),
      });
      if (placeholderMatch) return placeholderMatch;
    }
  }
  if (!company || !title) return null;
  const placeholders = (jobs ?? []).filter((job) => job.source === "gmail_application"
    && normalizeCompany(String(job.company)) === company
    && normalizeJobTitle(String(job.title)) === title);
  return placeholders.length === 1 ? { jobId: String(placeholders[0].id), confidence: 0.99, reason: "title_company" as const } : null;
}

async function createPlaceholder(input: { message: GmailMessage; title: string | null; company: string | null; gmailUrl: string; classification: string; classificationConfidence: number }) {
  const supabase = getSupabaseAdmin();
  if (!supabase) throw new Error("Supabase is not configured.");
  const title = input.title || "职位名称待补充";
  const company = input.company || "待确认公司";
  const reliableIdentity = Boolean(input.title && input.company && !isPlatformCompany(input.company));
  const confirmedAcknowledgement = isConfirmedAcknowledgement({ classification: input.classification, confidence: input.classificationConfidence });
  const identityKey = reliableIdentity ? `${normalizeCompany(input.company)}|${normalizeJobTitle(input.title)}` : input.message.id;
  const canonicalKey = `gmail-application:${createHash("sha256").update(identityKey).digest("hex").slice(0, 24)}`;
  const classificationTag = input.classification === "acknowledgement" ? "确认邮件" : "求职邮件";
  const { data: job, error } = await supabase.from("jobs").upsert({
    canonical_key: canonicalKey,
    company,
    title,
    track: /product|owner|business analyst/i.test(title) ? "product" : "design",
    location: "Not specified",
    remote_policy: "Not specified",
    score: 0,
    score_components: {},
    scoring_status: "completed",
    status: reliableIdentity || confirmedAcknowledgement ? "applied" : "new",
    language_requirement: "Not specified",
    tags: reliableIdentity
      ? ["邮件记录", "JD待补充", classificationTag]
      : confirmedAcknowledgement
        ? ["邮件记录", "职位待补充", classificationTag]
        : ["邮件记录", "待认领", classificationTag],
    source: "gmail_application",
    source_url: input.gmailUrl,
    summary: "Created from an application-related email. Add or assign the original JD before generating materials.",
    jd_text: null,
    jd_quality: "missing",
    match_reasons: [], blockers: [], warnings: ["Complete JD is missing"], matched_fact_ids: [],
    source_language: "en", audit_source: "gmail_mail_sync",
  }, { onConflict: "canonical_key" }).select("id").single();
  if (error) throw new Error(`Could not create placeholder job: ${error.message}`);
  return String(job.id);
}

async function improvePlaceholderIdentity(input: { jobId: string; title: string | null; company: string | null }) {
  if (!input.title && !input.company) return;
  const supabase = getSupabaseAdmin();
  if (!supabase) return;
  const { data: job, error } = await supabase.from("jobs")
    .select("id,title,company,source,tags,jd_quality")
    .eq("id", input.jobId)
    .maybeSingle();
  if (error) throw new Error(`Could not inspect placeholder job: ${error.message}`);
  if (!job || job.source !== "gmail_application") return;
  const title = !normalizeJobTitle(String(job.title)) && input.title ? input.title : String(job.title);
  const storedCompany = String(job.company);
  const companyPlaceholder = /@|待确认|unknown|not specified/i.test(storedCompany);
  const company = companyPlaceholder && input.company && !isPlatformCompany(input.company) ? input.company : storedCompany;
  if (title === job.title && company === job.company) return;
  const tags = (Array.isArray(job.tags) ? job.tags.map(String) : [])
    .filter((tag) => tag !== "待认领" && tag !== "职位待补充");
  if (job.jd_quality === "missing" && !tags.includes("JD待补充")) tags.push("JD待补充");
  const { error: updateError } = await supabase.from("jobs").update({
    title,
    company,
    track: /product|owner|business analyst/i.test(title) ? "product" : "design",
    tags,
    audit_source: "gmail_identity_upgrade",
  }).eq("id", input.jobId);
  if (updateError) throw new Error(`Could not improve placeholder job: ${updateError.message}`);
}

export async function updateApplicationStage(input: {
  applicationId: string;
  stage: ApplicationStage;
  source: string;
  note?: string | null;
  messageId?: string | null;
  nextAction?: string | null;
  nextActionAt?: string | null;
  classificationConfidence?: number | null;
  matchConfidence?: number | null;
  receivedAt?: string;
  requiresReview?: boolean;
}) {
  const supabase = getSupabaseAdmin();
  if (!supabase) throw new Error("Supabase is not configured.");
  const { data: current, error } = await supabase.from("applications").select("*,jobs!inner(id)").eq("id", input.applicationId).single();
  if (error) throw new Error(`Could not load application: ${error.message}`);
  const receivedAt = input.receivedAt ?? new Date().toISOString();
  const currentStage = current.status as ApplicationStage;
  if (!shouldAdvanceStage(currentStage, input.stage, receivedAt, current.latest_message_at) && input.source !== "manual") return { changed: false, stage: currentStage };
  const positive = ["interview", "task", "offer"].includes(input.stage);
  const { error: updateError } = await supabase.from("applications").update({
    status: input.stage,
    applied_at: input.stage === "applied" && !current.applied_at ? receivedAt : current.applied_at,
    next_action: input.stage === "rejected" ? null : input.nextAction ?? current.next_action,
    next_action_at: input.stage === "rejected" ? null : input.nextActionAt ?? current.next_action_at,
    latest_message_at: receivedAt,
    stage_source: input.source,
    classification_confidence: input.classificationConfidence ?? current.classification_confidence,
    match_confidence: input.matchConfidence ?? current.match_confidence,
    priority_at: positive ? receivedAt : current.priority_at,
    requires_review: input.requiresReview ?? false,
  }).eq("id", input.applicationId);
  if (updateError) throw new Error(`Could not update application: ${updateError.message}`);
  const { data: event, error: eventError } = await supabase.from("application_events").insert({ application_id: input.applicationId, application_message_id: input.messageId ?? null, from_status: currentStage, to_status: input.stage, note: input.note ?? null, source: input.source, metadata: { classificationConfidence: input.classificationConfidence, matchConfidence: input.matchConfidence } }).select("id").single();
  if (eventError) throw new Error(`Could not record application event: ${eventError.message}`);
  if (input.source === "manual") {
    await recordManualProcessStep({ applicationId: input.applicationId, eventId: String(event.id), fromStage: currentStage, toStage: input.stage, occurredAt: receivedAt, note: input.note });
  }
  await supabase.from("jobs").update({ status: input.stage === "needs_match" ? "new" : input.stage, audit_source: input.source }).eq("id", (current.jobs as unknown as { id: string }).id);
  if (positive) await generatePreparationPack(input.applicationId, input.source);
  return { changed: currentStage !== input.stage, stage: input.stage };
}

export async function processApplicationMessage(message: GmailMessage) {
  const supabase = getSupabaseAdmin();
  if (!supabase) throw new Error("Supabase is not configured.");
  const { data: duplicate } = await supabase.from("application_messages")
    .select("id,application_id,classification,extracted_company,extracted_title,parser_version,matcher_version")
    .eq("gmail_message_id", message.id)
    .maybeSingle();
  const parsed = parseGmailMessage(message);
  if (isApplicationNoise(parsed.subject, parsed.from, parsed.text)) return { status: "irrelevant" as const, updated: false, review: false };
  const receivedAt = message.internalDate ? new Date(Number(message.internalDate)).toISOString() : new Date().toISOString();
  let classification = classifyHeuristically(parsed.subject, parsed.text);
  const identity = inferIdentity(parsed.subject, parsed.sender.name, parsed.sender.email, parsed.text);
  let extractedCompany = identity.company ?? duplicate?.extracted_company ?? null;
  let extractedTitle = identity.title ?? duplicate?.extracted_title ?? null;
  let nextActionAt: string | null = null;
  const identityNeedsHelp = !extractedCompany || !extractedTitle || isPlatformCompany(extractedCompany);
  if ((classification.confidence < 0.9 || (identityNeedsHelp && !duplicate)) && env.DEEPSEEK_API_KEY) {
    try {
      const ai = await deepSeekProvider.classifyApplicationEmail({ subject: parsed.subject, sender: parsed.from, bodyText: parsed.text, receivedAt });
      if (classification.confidence < 0.9) classification = { classification: ai.classification, confidence: ai.confidence, nextAction: ai.nextAction };
      extractedCompany = ai.company ?? extractedCompany;
      extractedTitle = cleanIdentity(ai.title) ?? extractedTitle;
      nextActionAt = ai.nextActionAt;
    } catch (error) {
      console.warn("Application email identity enrichment failed", error instanceof Error ? error.message : "Unknown error");
    }
  }
  if (classification.classification === "other") return { status: "irrelevant" as const, updated: false, review: false };
  if (duplicate) {
    const { data: linkedApplication, error: linkedError } = await supabase.from("applications")
      .select("id,job_id,status,latest_message_at")
      .eq("id", duplicate.application_id)
      .single();
    if (linkedError) throw new Error(`Could not load existing application message link: ${linkedError.message}`);
    const applicationId = String(linkedApplication.id);
    const jobId = String(linkedApplication.job_id);
    const autoStage = classificationToStage(classification.classification);
    const autoUpdate = Boolean(autoStage && classification.confidence >= 0.9);
    const requiresReview = !autoUpdate;
    const { error: messageError } = await supabase.from("application_messages").update({
      subject: parsed.subject,
      sender_name: parsed.sender.name,
      sender_email: parsed.sender.email,
      received_at: receivedAt,
      body_text: parsed.text,
      classification: classification.classification,
      classification_confidence: classification.confidence,
      extracted_company: extractedCompany,
      extracted_title: extractedTitle,
      next_action: classification.nextAction,
      next_action_at: nextActionAt,
      match_confidence: 1,
      requires_review: requiresReview,
      parser_version: parsed.parserVersion,
      matcher_version: APPLICATION_MATCHER_VERSION,
    }).eq("id", duplicate.id);
    if (messageError) throw new Error(`Could not reclassify existing application email: ${messageError.message}`);
    await improvePlaceholderIdentity({ jobId, title: extractedTitle, company: extractedCompany });
    await recordMessageProcessStep({
      applicationId,
      messageId: String(duplicate.id),
      message: {
        classification: classification.classification,
        subject: parsed.subject,
        bodyText: parsed.text,
        receivedAt,
        nextAction: classification.nextAction,
        nextActionAt,
      },
      source: "gmail_mail_reclassification",
      metadata: { confidence: classification.confidence, matchConfidence: 1, matcherVersion: APPLICATION_MATCHER_VERSION },
    });
    let updated = duplicate.classification !== classification.classification;
    if (autoStage) {
      if (linkedApplication.status !== autoStage || updated) {
        const result = await updateApplicationStage({
          applicationId,
          stage: autoStage,
          source: "gmail_mail_reclassification",
          messageId: String(duplicate.id),
          note: `Existing email reclassified as ${classification.classification}`,
          nextAction: classification.nextAction,
          nextActionAt,
          classificationConfidence: classification.confidence,
          matchConfidence: 1,
          receivedAt,
          requiresReview: false,
        });
        updated = updated || result.changed;
      } else {
        await supabase.from("applications").update({
          latest_message_at: linkedApplication.latest_message_at ?? receivedAt,
          classification_confidence: classification.confidence,
          match_confidence: 1,
          requires_review: false,
        }).eq("id", applicationId);
      }
    } else {
      await supabase.from("applications").update({ requires_review: true }).eq("id", applicationId);
    }
    return { status: "duplicate" as const, updated, review: requiresReview };
  }
  const match = await matchExistingJob({ threadId: message.threadId, title: extractedTitle, company: extractedCompany, senderEmail: parsed.sender.email, receivedAt });
  const gmailUrl = gmailWebUrl(message.id);
  const placeholder = !match || match.confidence < 0.9;
  const reliableIdentity = Boolean(extractedTitle && extractedCompany && !isPlatformCompany(extractedCompany));
  const needsMatch = placeholder && !reliableIdentity;
  const confirmedAcknowledgement = isConfirmedAcknowledgement(classification);
  const identityRequiresReview = needsMatch && !confirmedAcknowledgement;
  const jobId = placeholder ? await createPlaceholder({ message, title: extractedTitle, company: extractedCompany, gmailUrl, classification: classification.classification, classificationConfidence: classification.confidence }) : match.jobId;
  await improvePlaceholderIdentity({ jobId, title: extractedTitle, company: extractedCompany });
  const { data: existingApplication, error: existingError } = await supabase.from("applications").select("id,status").eq("job_id", jobId).maybeSingle();
  if (existingError) throw new Error(`Could not load application: ${existingError.message}`);
  let application = existingApplication;
  if (!application) {
    const created = await supabase.from("applications").insert({ job_id: jobId, status: identityRequiresReview ? "needs_match" : "applied", stage_source: "gmail_mail_sync", requires_review: identityRequiresReview }).select("id,status").single();
    if (created.error) throw new Error(`Could not create application: ${created.error.message}`);
    application = created.data;
  }
  const applicationId = String(application.id);
  const autoStage = classificationToStage(classification.classification);
  const resolvedConfidence = placeholder ? (reliableIdentity ? 0.9 : 0) : match?.confidence ?? 0;
  const autoUpdate = Boolean(autoStage && classification.confidence >= 0.9 && (confirmedAcknowledgement || resolvedConfidence >= 0.9));
  const requiresReview = !autoUpdate;
  const { data: saved, error: messageError } = await supabase.from("application_messages").insert({
    application_id: applicationId,
    gmail_message_id: message.id,
    gmail_thread_id: message.threadId ?? null,
    gmail_url: gmailUrl,
    subject: parsed.subject,
    sender_name: parsed.sender.name,
    sender_email: parsed.sender.email,
    received_at: receivedAt,
    body_text: parsed.text,
    classification: classification.classification,
    classification_confidence: classification.confidence,
    extracted_company: extractedCompany,
    extracted_title: extractedTitle,
    next_action: classification.nextAction,
    next_action_at: nextActionAt,
    match_confidence: resolvedConfidence,
    requires_review: requiresReview || identityRequiresReview,
    parser_version: parsed.parserVersion,
    matcher_version: APPLICATION_MATCHER_VERSION,
  }).select("id").single();
  if (messageError) throw new Error(`Could not save application email: ${messageError.message}`);
  await recordMessageProcessStep({
    applicationId,
    messageId: String(saved.id),
    message: {
      classification: classification.classification,
      subject: parsed.subject,
      bodyText: parsed.text,
      receivedAt,
      nextAction: classification.nextAction,
      nextActionAt,
    },
    source: "gmail_mail_sync",
    metadata: { confidence: classification.confidence, matchConfidence: resolvedConfidence, matcherVersion: APPLICATION_MATCHER_VERSION },
  });
  let updated = false;
  if (autoStage) {
    const result = await updateApplicationStage({ applicationId, stage: autoUpdate ? autoStage : application.status as ApplicationStage, source: "gmail_mail_sync", messageId: saved.id, note: `Email classified as ${classification.classification}`, nextAction: classification.nextAction, nextActionAt, classificationConfidence: classification.confidence, matchConfidence: resolvedConfidence, receivedAt, requiresReview: requiresReview || identityRequiresReview });
    updated = autoUpdate && result.changed;
  } else {
    await supabase.from("applications").update({ latest_message_at: receivedAt, requires_review: true, classification_confidence: classification.confidence, match_confidence: resolvedConfidence }).eq("id", applicationId);
  }
  return { status: "imported" as const, updated, review: requiresReview || identityRequiresReview };
}
