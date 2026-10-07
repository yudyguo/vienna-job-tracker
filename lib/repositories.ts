import "server-only";
import { getSupabaseAdmin, isSupabaseConfigured } from "@/lib/supabase/server";
import { demoApplications, demoJobs, demoMaterials, demoRuns } from "@/lib/sample-data";
import type { Application, ApplicationMessage, ApplicationProcessStep, AutomationRun, GmailConnectionHealth, Job, JobDossier, MailSyncRun, MaterialVersion, PreparationPackVersion } from "@/lib/types";
import { classifyJobInboxKind } from "@/lib/jobs/inbox";
import { isTrustedStageClassification } from "@/lib/email/classifier";

async function runSupabaseQuery<T>(query: () => PromiseLike<T>): Promise<T> {
  let result = await query();
  const error = (result as { error?: { message?: string } | null }).error;
  if (error?.message && /JWT issued at future/i.test(error.message)) {
    await new Promise((resolve) => setTimeout(resolve, 250));
    result = await query();
  }
  return result;
}

function toJob(row: Record<string, unknown>): Job {
  const applications = Array.isArray(row.applications)
    ? row.applications as Array<Record<string, unknown>>
    : row.applications && typeof row.applications === "object"
      ? [row.applications as Record<string, unknown>]
      : [];
  const application = applications[0];
  const source = String(row.source ?? "Manual");
  const mailClassifications = applications.flatMap((item) => {
    const messages = Array.isArray(item.application_messages)
      ? item.application_messages as Array<Record<string, unknown>>
      : item.application_messages && typeof item.application_messages === "object"
        ? [item.application_messages as Record<string, unknown>]
        : [];
    return messages.map((message) => message.classification).filter(Boolean) as ApplicationMessage["classification"][];
  });
  return {
    id: String(row.id),
    company: String(row.company),
    title: String(row.title),
    track: row.track === "product" ? "product" : "design",
    location: String(row.location ?? ""),
    remotePolicy: String(row.remote_policy ?? "Not specified"),
    score: Number(row.score ?? 0),
    scoringStatus: (row.scoring_status as Job["scoringStatus"]) ?? "completed",
    scoringError: row.scoring_error == null ? null : String(row.scoring_error),
    listingStatus: (row.listing_status as Job["listingStatus"]) ?? "unknown",
    listingStatusSource: row.listing_status_source == null ? null : String(row.listing_status_source),
    listingCheckedAt: row.listing_checked_at == null ? null : String(row.listing_checked_at),
    listingClosedAt: row.listing_closed_at == null ? null : String(row.listing_closed_at),
    status: (row.status as Job["status"]) ?? "new",
    languageRequirement: String(row.language_requirement ?? "Not specified"),
    salaryMin: row.salary_min == null ? null : Number(row.salary_min),
    salaryMax: row.salary_max == null ? null : Number(row.salary_max),
    currency: row.currency == null ? null : String(row.currency),
    tags: Array.isArray(row.tags) ? row.tags.map(String) : [],
    source,
    sourceUrl: row.source_url == null ? null : String(row.source_url),
    publishedAt: String(row.published_at ?? row.created_at),
    capturedAt: String(row.captured_at ?? row.created_at),
    summary: String(row.summary ?? ""),
    matchReasons: Array.isArray(row.match_reasons) ? row.match_reasons.map(String) : [],
    blockers: Array.isArray(row.blockers) ? row.blockers.map(String) : [],
    jdText: row.jd_text == null ? undefined : String(row.jd_text),
    jdQuality: (row.jd_quality as Job["jdQuality"]) ?? "full",
    parserVersion: row.parser_version == null ? null : String(row.parser_version),
    applicationStage: application ? application.status as Job["applicationStage"] : null,
    applicationNextAction: application?.next_action == null ? null : String(application.next_action),
    applicationNextActionAt: application?.next_action_at == null ? null : String(application.next_action_at),
    applicationLatestMessageAt: application?.latest_message_at == null ? null : String(application.latest_message_at),
    applicationRequiresReview: Boolean(application?.requires_review),
    inboxKind: classifyJobInboxKind(source, mailClassifications, Boolean(application?.requires_review)),
  };
}

function jobPriority(job: Job) {
  if (job.listingStatus === "closed" || job.applicationStage === "rejected" || job.status === "rejected") return -10;
  if (job.applicationStage === "offer") return 60;
  if (job.applicationStage === "interview") return 50;
  if (job.applicationStage === "task") return 50;
  if (job.applicationStage === "applied" && job.applicationNextAction) return 40;
  return 0;
}

function normalizeApplicationIdentity(value?: string | null) {
  const raw = (value ?? "").toLowerCase().normalize("NFKD");
  const emailDomain = raw.match(/@([a-z0-9-]+)(?:\.[a-z]{2,})/i)?.[1];
  return (emailDomain ?? raw)
    .replace(/\boeservice\b/g, "oe service")
    .replace(/\b(gmbh|ag|inc|ltd|limited|kg|og|e\.u\.|group|recruiting|recruitment|team)\b/g, " ")
    .replace(/[^a-z0-9äöüß]+/g, " ").trim();
}

function usefulExtractedTitle(value?: string | null) {
  const title = value?.trim();
  if (!title || /^(?:die |the )?(?:position|role|stelle|job)$/i.test(title)) return null;
  return title;
}

function stageFromClassification(classification?: ApplicationMessage["classification"] | null): Application["status"] | null {
  if (classification === "acknowledgement") return "applied";
  if (classification === "interview") return "interview";
  if (classification === "task") return "task";
  if (classification === "offer") return "offer";
  if (classification === "rejection") return "rejected";
  return null;
}

function classificationFromStage(stage: Application["status"]): Application["latestMessageType"] {
  if (stage === "applied") return "acknowledgement";
  if (stage === "interview") return "interview";
  if (stage === "task") return "task";
  if (stage === "offer") return "offer";
  if (stage === "rejected") return "rejection";
  return null;
}

export async function listJobs(): Promise<{ data: Job[]; demo: boolean }> {
  const supabase = getSupabaseAdmin();
  if (!supabase) return { data: demoJobs, demo: true };
  const { data, error } = await runSupabaseQuery(() => supabase.from("jobs").select("*, applications(status,next_action,next_action_at,latest_message_at,requires_review,application_messages(classification))").is("merged_into_job_id", null).order("score", { ascending: false }));
  if (error) throw new Error(`Could not load jobs: ${error.message}`);
  const jobs = (data ?? []).map((row) => toJob(row));
  jobs.sort((left, right) => {
    const priority = jobPriority(right) - jobPriority(left);
    if (priority !== 0) return priority;
    return right.score - left.score;
  });
  return { data: jobs, demo: false };
}

export async function getJob(id: string): Promise<Job | null> {
  if (!isSupabaseConfigured()) return demoJobs.find((job) => job.id === id) ?? null;
  const supabase = getSupabaseAdmin();
  if (!supabase) return null;
  const { data, error } = await runSupabaseQuery(() => supabase.from("jobs").select("*").eq("id", id).maybeSingle());
  if (error) throw new Error(`Could not load job: ${error.message}`);
  return data ? toJob(data) : null;
}

export async function listMaterials(): Promise<{ data: MaterialVersion[]; demo: boolean }> {
  const supabase = getSupabaseAdmin();
  if (!supabase) return { data: demoMaterials, demo: true };
  const { data, error } = await runSupabaseQuery(() => supabase
    .from("material_versions")
    .select("*, materials!inner(job_id, kind, language, jobs!inner(title, company))")
    .order("created_at", { ascending: false }));
  if (error) throw new Error(`Could not load materials: ${error.message}`);
  const mapped = (data ?? []).map((row: Record<string, unknown>) => {
    const material = row.materials as Record<string, unknown>;
    const job = material.jobs as Record<string, unknown>;
    return {
      id: String(row.id),
      materialId: String(row.material_id),
      version: Number(row.version),
      jobId: String(material.job_id),
      jobTitle: String(job.title),
      company: String(job.company),
      kind: material.kind as MaterialVersion["kind"],
      language: material.language as MaterialVersion["language"],
      format: row.format as MaterialVersion["format"],
      status: row.status as MaterialVersion["status"],
      storagePath: row.storage_path == null ? null : String(row.storage_path),
      createdAt: String(row.created_at),
      model: row.model == null ? null : String(row.model),
      factIds: Array.isArray(row.fact_ids) ? row.fact_ids.map(String) : [],
    } satisfies MaterialVersion;
  });
  return { data: mapped, demo: false };
}

export async function listApplications(): Promise<{ data: Application[]; demo: boolean }> {
  const supabase = getSupabaseAdmin();
  if (!supabase) return { data: demoApplications, demo: true };
  const { data, error } = await runSupabaseQuery(() => supabase
    .from("applications")
    .select("*, jobs!inner(company,title,jd_quality,source), application_messages(id,classification,received_at,subject,extracted_company,extracted_title,requires_review,classification_confidence,match_confidence)")
    .order("updated_at", { ascending: false }));
  if (error) throw new Error(`Could not load applications: ${error.message}`);
  const mapped = (data ?? []).flatMap((row: Record<string, unknown>) => {
    const job = row.jobs as Record<string, unknown>;
    const messages = Array.isArray(row.application_messages) ? row.application_messages as Array<Record<string, unknown>> : [];
    messages.sort((left, right) => String(right.received_at).localeCompare(String(left.received_at)));
    const storedTitle = String(job.title);
    const storedCompany = String(job.company);
    const placeholderTitle = /^(?:待认领的申请职位|职位名称待补充|application to claim)$/i.test(storedTitle.trim());
    const messageGroups = new Map<string, Array<Record<string, unknown>>>();
    for (const message of messages) {
      const extractedCompany = message.extracted_company ? String(message.extracted_company) : storedCompany;
      const key = normalizeApplicationIdentity(extractedCompany) || normalizeApplicationIdentity(storedCompany);
      const group = messageGroups.get(key) ?? [];
      group.push(message);
      messageGroups.set(key, group);
    }
    if (!messageGroups.size) messageGroups.set(normalizeApplicationIdentity(storedCompany), []);
    return [...messageGroups.entries()].map(([companyKey, groupedMessages]) => {
      const latestMessage = groupedMessages[0];
      const identityMessage = groupedMessages.find((message) => message.extracted_company || usefulExtractedTitle(message.extracted_title ? String(message.extracted_title) : null));
      const extractedCompany = identityMessage?.extracted_company ? String(identityMessage.extracted_company) : storedCompany;
      const extractedTitle = usefulExtractedTitle(identityMessage?.extracted_title ? String(identityMessage.extracted_title) : null);
      return {
        application: {
          id: String(row.id),
          jobId: String(row.job_id),
          company: extractedCompany,
          title: extractedTitle ?? (placeholderTitle ? String(latestMessage?.subject ?? storedTitle) : storedTitle),
          status: row.status as Application["status"],
          appliedAt: row.applied_at == null ? null : String(row.applied_at),
          nextAction: row.next_action == null ? null : String(row.next_action),
          nextActionAt: row.next_action_at == null ? null : String(row.next_action_at),
          latestMessageAt: latestMessage?.received_at ? String(latestMessage.received_at) : row.latest_message_at == null ? null : String(row.latest_message_at),
          latestMessageType: latestMessage?.classification as Application["latestMessageType"] ?? null,
          stageSource: String(row.stage_source ?? "manual"),
          classificationConfidence: row.classification_confidence == null ? null : Number(row.classification_confidence),
          matchConfidence: row.match_confidence == null ? null : Number(row.match_confidence),
          priorityAt: row.priority_at == null ? null : String(row.priority_at),
          requiresReview: Boolean(row.requires_review),
          jdQuality: (job.jd_quality as Application["jdQuality"]) ?? "full",
          updatedAt: String(row.updated_at),
        } satisfies Application,
        extractedTitle,
        companyKey,
        storedCompanyKey: normalizeApplicationIdentity(storedCompany),
        messages: groupedMessages,
      };
    });
  });
  const companyTitles = new Map<string, Map<string, string>>();
  for (const item of mapped) {
    if (!item.extractedTitle || !item.companyKey) continue;
    const titles = companyTitles.get(item.companyKey) ?? new Map<string, string>();
    titles.set(normalizeApplicationIdentity(item.extractedTitle), item.extractedTitle);
    companyTitles.set(item.companyKey, titles);
  }
  const groups = new Map<string, typeof mapped>();
  for (const item of mapped) {
    const knownTitles = companyTitles.get(item.companyKey);
    const inferredTitle = item.extractedTitle ?? (knownTitles?.size === 1 ? [...knownTitles.values()][0] : null);
    const groupable = item.companyKey && inferredTitle;
    const key = groupable ? `${item.companyKey}::${normalizeApplicationIdentity(inferredTitle)}` : `application:${item.application.id}`;
    const group = groups.get(key) ?? [];
    group.push(item);
    groups.set(key, group);
  }
  const grouped = [...groups.entries()].map(([logicalId, group]) => {
    const latest = [...group].sort((left, right) => new Date(right.application.latestMessageAt ?? right.application.updatedAt).getTime() - new Date(left.application.latestMessageAt ?? left.application.updatedAt).getTime())[0];
    const representative = group.find((item) => item.storedCompanyKey === item.companyKey) ?? latest;
    const allMessages = group.flatMap((item) => item.messages).sort((left, right) => String(right.received_at).localeCompare(String(left.received_at)));
    const latestStageMessage = allMessages.find((message) => isTrustedStageClassification(message)
      && stageFromClassification(message.classification as ApplicationMessage["classification"]));
    const groupedStage = stageFromClassification(latestStageMessage?.classification as ApplicationMessage["classification"] | undefined) ?? latest.application.status;
    const resolvedTitle = group.find((item) => item.extractedTitle)?.extractedTitle ?? representative.application.title;
    const nextActionOwner = group
      .filter((item) => item.application.nextAction)
      .sort((left, right) => new Date(right.application.nextActionAt ?? right.application.latestMessageAt ?? 0).getTime() - new Date(left.application.nextActionAt ?? left.application.latestMessageAt ?? 0).getTime())[0];
    return {
      ...representative.application,
      title: resolvedTitle ?? representative.application.title,
      company: group.find((item) => item.companyKey)?.application.company ?? representative.application.company,
      status: groupedStage,
      latestMessageAt: latest.application.latestMessageAt,
      latestMessageType: latestStageMessage?.classification as Application["latestMessageType"]
        ?? (allMessages.length ? classificationFromStage(groupedStage) : null),
      nextAction: groupedStage === "rejected" || groupedStage === "archived" ? null : nextActionOwner?.application.nextAction ?? null,
      nextActionAt: groupedStage === "rejected" || groupedStage === "archived" ? null : nextActionOwner?.application.nextActionAt ?? null,
      requiresReview: group.some((item) => item.application.requiresReview),
      updatedAt: latest.application.updatedAt,
      relatedApplicationIds: [...new Set(group.map((item) => item.application.id))],
      relatedJobIds: [...new Set(group.filter((item) => item.companyKey === item.storedCompanyKey).map((item) => item.application.jobId))],
      relatedMessageIds: [...new Set(allMessages.map((message) => String(message.id)))],
      logicalId,
    } satisfies Application;
  });
  return {
    data: grouped,
    demo: false,
  };
}

function toApplicationMessage(row: Record<string, unknown>): ApplicationMessage {
  return {
    id: String(row.id),
    applicationId: String(row.application_id),
    gmailUrl: String(row.gmail_url),
    subject: String(row.subject),
    senderName: row.sender_name == null ? null : String(row.sender_name),
    senderEmail: row.sender_email == null ? null : String(row.sender_email),
    receivedAt: String(row.received_at),
    bodyText: String(row.body_text),
    classification: row.classification as ApplicationMessage["classification"],
    classificationConfidence: Number(row.classification_confidence),
    extractedCompany: row.extracted_company == null ? null : String(row.extracted_company),
    extractedTitle: row.extracted_title == null ? null : String(row.extracted_title),
    nextAction: row.next_action == null ? null : String(row.next_action),
    nextActionAt: row.next_action_at == null ? null : String(row.next_action_at),
    matchConfidence: row.match_confidence == null ? null : Number(row.match_confidence),
    requiresReview: Boolean(row.requires_review),
  };
}

export async function getJobDossier(id: string): Promise<JobDossier | null> {
  const job = await getJob(id);
  if (!job) return null;
  if (!isSupabaseConfigured()) return { job, application: null, messages: [], preparationPacks: [], processSteps: [], materialCount: 0 };
  const supabase = getSupabaseAdmin();
  if (!supabase) return null;
  const { data: applicationRow, error: applicationError } = await runSupabaseQuery(() => supabase
    .from("applications")
    .select("*, jobs!inner(company,title,jd_quality)")
    .eq("job_id", id)
    .maybeSingle());
  if (applicationError) throw new Error(`Could not load application dossier: ${applicationError.message}`);
  let application: Application | null = null;
  let messages: ApplicationMessage[] = [];
  let preparationPacks: PreparationPackVersion[] = [];
  let processSteps: ApplicationProcessStep[] = [];
  if (applicationRow) {
    const joined = applicationRow.jobs as Record<string, unknown>;
    const currentApplication = {
      id: String(applicationRow.id), jobId: id, company: String(joined.company), title: String(joined.title),
      status: applicationRow.status as Application["status"], appliedAt: applicationRow.applied_at,
      nextAction: applicationRow.next_action, nextActionAt: applicationRow.next_action_at,
      latestMessageAt: applicationRow.latest_message_at, latestMessageType: null,
      stageSource: String(applicationRow.stage_source), classificationConfidence: applicationRow.classification_confidence,
      matchConfidence: applicationRow.match_confidence, priorityAt: applicationRow.priority_at,
      requiresReview: Boolean(applicationRow.requires_review), jdQuality: (joined.jd_quality as Application["jdQuality"]) ?? "full",
      updatedAt: String(applicationRow.updated_at),
    } satisfies Application;
    const { data: groupedApplications } = await listApplications();
    const exactGroupedApplication = groupedApplications.find((item) => item.jobId === id || item.relatedJobIds?.includes(id));
    const applicationGroups = groupedApplications.filter((item) => item.relatedApplicationIds?.includes(String(applicationRow.id)));
    const groupedApplication = exactGroupedApplication ?? (applicationGroups.length === 1 ? applicationGroups[0] : undefined);
    application = groupedApplication ?? currentApplication;
    const relatedApplicationIds = [...new Set([
      String(applicationRow.id),
      ...(groupedApplication?.relatedApplicationIds ?? []),
    ])];
    const relatedMessageIds = groupedApplication?.relatedMessageIds ?? [];
    const [{ data: messageRows, error: messageError }, { data: packRows, error: packError }, { data: stepRows, error: stepError }] = await Promise.all([
      runSupabaseQuery(() => {
        const query = supabase.from("application_messages").select("*");
        return (relatedMessageIds.length ? query.in("id", relatedMessageIds) : query.in("application_id", relatedApplicationIds)).order("received_at", { ascending: false });
      }),
      runSupabaseQuery(() => supabase.from("preparation_pack_versions").select("*, preparation_packs!inner(application_id,kind)").in("preparation_packs.application_id", relatedApplicationIds).order("created_at", { ascending: false })),
      runSupabaseQuery(() => supabase.from("application_process_steps").select("*").in("application_id", relatedApplicationIds).order("occurred_at", { ascending: true })),
    ]);
    if (messageError) throw new Error(`Could not load application messages: ${messageError.message}`);
    if (packError) throw new Error(`Could not load preparation packs: ${packError.message}`);
    if (stepError) throw new Error(`Could not load application process: ${stepError.message}`);
    messages = (messageRows ?? []).map((row) => toApplicationMessage(row));
    if (!groupedApplication) application.latestMessageType = messages[0]?.classification ?? null;
    preparationPacks = (packRows ?? []).map((row: Record<string, unknown>) => {
      const pack = row.preparation_packs as Record<string, unknown>;
      return {
        id: String(row.id), applicationId: String(pack.application_id), kind: pack.kind as PreparationPackVersion["kind"],
        version: Number(row.version), status: row.status as PreparationPackVersion["status"],
        content: row.content_json as PreparationPackVersion["content"], factIds: Array.isArray(row.fact_ids) ? row.fact_ids.map(String) : [], createdAt: String(row.created_at),
      };
    });
    const relatedMessageIdSet = new Set(relatedMessageIds);
    processSteps = (stepRows ?? []).map((row: Record<string, unknown>) => ({
      id: String(row.id),
      applicationId: String(row.application_id),
      messageId: row.application_message_id == null ? null : String(row.application_message_id),
      eventId: row.application_event_id == null ? null : String(row.application_event_id),
      kind: row.kind as ApplicationProcessStep["kind"],
      roundNumber: row.round_number == null ? null : Number(row.round_number),
      title: String(row.title),
      occurredAt: String(row.occurred_at),
      scheduledAt: row.scheduled_at == null ? null : String(row.scheduled_at),
      source: String(row.source),
      notes: row.notes == null ? null : String(row.notes),
      metadata: row.metadata && typeof row.metadata === "object" ? row.metadata as Record<string, unknown> : {},
    })).filter((step) => !step.messageId || !relatedMessageIdSet.size || relatedMessageIdSet.has(step.messageId));
  }
  const { count, error: materialError } = await runSupabaseQuery(() => supabase.from("materials").select("id", { count: "exact", head: true }).eq("job_id", id));
  if (materialError) throw new Error(`Could not load material count: ${materialError.message}`);
  return { job, application, messages, preparationPacks, processSteps, materialCount: count ?? 0 };
}

export async function listAutomationRuns(): Promise<{ data: AutomationRun[]; demo: boolean }> {
  const supabase = getSupabaseAdmin();
  if (!supabase) return { data: demoRuns, demo: true };
  const { data, error } = await runSupabaseQuery(() => supabase.from("automation_runs").select("*").order("started_at", { ascending: false }).limit(30));
  if (error) throw new Error(`Could not load automation runs: ${error.message}`);
  return {
    data: (data ?? []).map((row: Record<string, unknown>) => ({
      id: String(row.id),
      localDate: String(row.local_date),
      trigger: row.trigger as AutomationRun["trigger"],
      status: row.status as AutomationRun["status"],
      discovered: Number(row.discovered ?? 0),
      deduplicated: Number(row.deduplicated ?? 0),
      highScore: Number(row.high_score ?? 0),
      generated: Number(row.generated ?? 0),
      error: row.error == null ? null : String(row.error),
      startedAt: String(row.started_at),
      completedAt: row.completed_at == null ? null : String(row.completed_at),
    })),
    demo: false,
  };
}

export async function listMailSyncRuns(): Promise<MailSyncRun[]> {
  const supabase = getSupabaseAdmin();
  if (!supabase) return [];
  const { data, error } = await runSupabaseQuery(() => supabase.from("mail_sync_runs").select("*").order("started_at", { ascending: false }).limit(30));
  if (error) throw new Error(`Could not load mail sync runs: ${error.message}`);
  return (data ?? []).map((row) => ({
    id: String(row.id), trigger: row.trigger as MailSyncRun["trigger"], status: row.status as MailSyncRun["status"],
    scanned: Number(row.scanned), candidates: Number(row.candidates), imported: Number(row.imported),
    updatedApplications: Number(row.updated_applications), needsReview: Number(row.needs_review),
    error: row.error == null ? null : String(row.error), startedAt: String(row.started_at), completedAt: row.completed_at == null ? null : String(row.completed_at),
  }));
}

export async function getGmailConnectionHealth(): Promise<GmailConnectionHealth> {
  const supabase = getSupabaseAdmin();
  if (!supabase) return { status: "not_connected" };
  const { data, error } = await runSupabaseQuery(() => supabase.from("oauth_connections")
    .select("account_email,metadata")
    .eq("provider", "gmail")
    .maybeSingle());
  if (error) throw new Error(`Could not load Gmail connection health: ${error.message}`);
  if (!data) return { status: "not_connected" };
  const metadata = data.metadata && typeof data.metadata === "object" ? data.metadata as Record<string, unknown> : {};
  const status = metadata.connectionStatus === "reauthorization_required" ? "reauthorization_required" : "active";
  return {
    status,
    accountEmail: data.account_email == null ? null : String(data.account_email),
    connectedAt: typeof metadata.connectedAt === "string" ? metadata.connectedAt : null,
    lastErrorAt: typeof metadata.lastErrorAt === "string" ? metadata.lastErrorAt : null,
  };
}
