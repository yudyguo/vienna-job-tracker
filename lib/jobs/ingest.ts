import "server-only";
import { deepSeekProvider } from "@/lib/ai/deepseek-provider";
import { listCandidateFacts } from "@/lib/candidate-facts";
import { env } from "@/lib/env";
import { canonicalJobKey, scoreJob } from "@/lib/scoring";
import { getSupabaseAdmin } from "@/lib/supabase/server";
import type { JdQuality, Job } from "@/lib/types";

export interface RawJob {
  company: string;
  title: string;
  location: string;
  jdText: string;
  source: string;
  sourceUrl?: string | null;
  externalId?: string | null;
  publishedAt?: string | null;
  jdQuality?: JdQuality;
  parserVersion?: string | null;
}

function provisionalTrack(title: string): Job["track"] {
  return /\b(product|project manager|product owner|business analyst|requirements? engineer)\b/i.test(title)
    ? "product"
    : "design";
}

function fallbackExtract(raw: RawJob) {
  const years = raw.jdText.match(/(\d+)\+?\s*(?:years?|Jahre)/i)?.[1];
  const salary = raw.jdText.match(/(?:€|EUR\s*)(\d{2,3})[.,]?(\d{3})?/i);
  const salaryValue = salary ? Number(`${salary[1]}${salary[2] ?? "000"}`) : null;
  const language = raw.jdText.match(/(?:German|Deutsch)[^\n,.]{0,35}(?:A\d|B\d|C\d|native|fluent)/i)?.[0] ?? "Not specified";
  return {
    summary: raw.jdText.replace(/\s+/g, " ").slice(0, 420),
    remotePolicy: /hybrid/i.test(raw.jdText) ? "Hybrid" : /remote/i.test(raw.jdText) ? "Remote" : "Not specified",
    languageRequirement: language,
    salaryMin: salaryValue,
    salaryMax: null,
    currency: salaryValue ? "EUR" : null,
    yearsRequired: years ? Number(years) : null,
    employmentType: null,
    skills: [],
    hardRequirements: [],
    publishedAt: raw.publishedAt ?? null,
    isGermanJd: /\b(und|oder|Kenntnisse|Aufgaben|Anforderungen|wir suchen)\b/i.test(raw.jdText),
  };
}

export async function ingestJob(raw: RawJob, auditSource = "manual") {
  const supabase = getSupabaseAdmin();
  if (!supabase) throw new Error("Supabase is not configured.");
  const facts = await listCandidateFacts();
  const extracted = env.DEEPSEEK_API_KEY && (raw.jdQuality ?? "full") === "full"
    ? await deepSeekProvider.extractJob(raw)
    : fallbackExtract(raw);
  const score = scoreJob({
    title: raw.title,
    description: raw.jdText,
    location: raw.location,
    remotePolicy: extracted.remotePolicy,
    languageRequirement: extracted.languageRequirement,
    yearsRequired: extracted.yearsRequired,
    salaryMin: extracted.salaryMin,
    employmentType: extracted.employmentType,
    publishedAt: extracted.publishedAt ?? raw.publishedAt,
    jdQuality: raw.jdQuality ?? "full",
  }, facts);
  const factMatch = raw.jdQuality !== "full"
    ? { factIds: [] as string[], reasons: [] as string[], gaps: ["Full job description required for evidence matching"] }
    : env.DEEPSEEK_API_KEY
    ? await deepSeekProvider.matchFacts({ title: raw.title, company: raw.company, summary: extracted.summary, jdText: raw.jdText }, facts)
    : {
        factIds: score.matchedFactIds,
        reasons: score.matchedFactIds.slice(0, 5).map((id) => facts.find((fact) => fact.id === id)?.label).filter((value): value is string => Boolean(value)),
        gaps: [],
      };
  const provisional = {
    company: raw.company,
    title: raw.title,
    location: raw.location,
    sourceUrl: raw.sourceUrl ?? null,
  };
  const canonicalKey = canonicalJobKey(provisional);
  const { data: existing } = await supabase.from("jobs").select("status").eq("canonical_key", canonicalKey).maybeSingle();
  const activeStatus = existing?.status && !["new", "shortlisted", "archived"].includes(existing.status)
    ? existing.status
    : score.blockers.length ? "archived" : score.score >= 80 ? "shortlisted" : "new";
  const row = {
    canonical_key: canonicalKey,
    company: raw.company,
    title: raw.title,
    track: score.track,
    location: raw.location,
    remote_policy: extracted.remotePolicy,
    score: score.score,
    scoring_status: "completed",
    scoring_error: null,
    scoring_completed_at: new Date().toISOString(),
    score_components: score.components,
    status: activeStatus,
    language_requirement: extracted.languageRequirement,
    salary_min: extracted.salaryMin,
    salary_max: extracted.salaryMax,
    currency: extracted.currency,
    years_required: extracted.yearsRequired,
    employment_type: extracted.employmentType,
    tags: extracted.skills.slice(0, 12),
    source: raw.source,
    source_url: raw.sourceUrl ?? null,
    published_at: extracted.publishedAt ?? raw.publishedAt ?? new Date().toISOString(),
    summary: extracted.summary,
    jd_text: raw.jdText,
    jd_quality: raw.jdQuality ?? "full",
    parser_version: raw.parserVersion ?? null,
    match_reasons: factMatch.reasons,
    blockers: score.blockers,
    warnings: score.warnings,
    matched_fact_ids: [...new Set([...score.matchedFactIds, ...factMatch.factIds])],
    source_language: extracted.isGermanJd ? "de" : "en",
    audit_source: auditSource,
  };
  const { data: job, error } = await supabase.from("jobs").upsert(row, { onConflict: "canonical_key" }).select("*").single();
  if (error) throw new Error(`Could not save job: ${error.message}`);

  await supabase.from("job_sources").upsert({
    job_id: job.id,
    source_type: raw.source,
    source_url: raw.sourceUrl ?? null,
    external_id: raw.externalId ?? canonicalKey,
    raw_snapshot: { title: raw.title, company: raw.company, location: raw.location },
    last_seen_at: new Date().toISOString(),
  }, { onConflict: "job_id,source_type,external_id" });

  const { count } = await supabase.from("job_versions").select("id", { count: "exact", head: true }).eq("job_id", job.id);
  await supabase.from("job_versions").insert({ job_id: job.id, version: (count ?? 0) + 1, snapshot: row, source: auditSource });
  return job as Record<string, unknown> & { id: string };
}

export async function createQueuedJob(raw: RawJob, auditSource = "manual") {
  const supabase = getSupabaseAdmin();
  if (!supabase) throw new Error("Supabase is not configured.");
  const canonicalKey = canonicalJobKey({
    company: raw.company,
    title: raw.title,
    location: raw.location,
    sourceUrl: raw.sourceUrl ?? null,
  });
  const { data: existing } = await supabase
    .from("jobs")
    .select("status")
    .eq("canonical_key", canonicalKey)
    .maybeSingle();
  const fallback = fallbackExtract(raw);
  const row = {
    canonical_key: canonicalKey,
    company: raw.company,
    title: raw.title,
    track: provisionalTrack(raw.title),
    location: raw.location,
    remote_policy: fallback.remotePolicy,
    score: 0,
    score_components: {},
    scoring_status: "queued",
    scoring_error: null,
    scoring_workflow_run_id: null,
    scoring_started_at: null,
    scoring_completed_at: null,
    status: existing?.status ?? "new",
    language_requirement: fallback.languageRequirement,
    salary_min: fallback.salaryMin,
    salary_max: fallback.salaryMax,
    currency: fallback.currency,
    years_required: fallback.yearsRequired,
    employment_type: fallback.employmentType,
    tags: [],
    source: raw.source,
    source_url: raw.sourceUrl ?? null,
    published_at: raw.publishedAt ?? new Date().toISOString(),
    summary: fallback.summary,
    jd_text: raw.jdText,
    jd_quality: raw.jdQuality ?? "full",
    parser_version: raw.parserVersion ?? null,
    match_reasons: [],
    blockers: [],
    warnings: [],
    matched_fact_ids: [],
    source_language: fallback.isGermanJd ? "de" : "en",
    audit_source: auditSource,
  };
  const { data: job, error } = await supabase
    .from("jobs")
    .upsert(row, { onConflict: "canonical_key" })
    .select("*")
    .single();
  if (error) throw new Error(`Could not save queued job: ${error.message}`);

  await supabase.from("job_sources").upsert({
    job_id: job.id,
    source_type: raw.source,
    source_url: raw.sourceUrl ?? null,
    external_id: raw.externalId ?? canonicalKey,
    raw_snapshot: { title: raw.title, company: raw.company, location: raw.location },
    last_seen_at: new Date().toISOString(),
  }, { onConflict: "job_id,source_type,external_id" });

  const { count } = await supabase
    .from("job_versions")
    .select("id", { count: "exact", head: true })
    .eq("job_id", job.id);
  await supabase.from("job_versions").insert({
    job_id: job.id,
    version: (count ?? 0) + 1,
    snapshot: row,
    source: `${auditSource}_queued`,
  });
  return job as Record<string, unknown> & { id: string };
}

export function dbJobToJob(row: Record<string, unknown>): Job {
  return {
    id: String(row.id), company: String(row.company), title: String(row.title), track: row.track === "product" ? "product" : "design",
    location: String(row.location), remotePolicy: String(row.remote_policy), score: Number(row.score), status: row.status as Job["status"],
    scoringStatus: (row.scoring_status as Job["scoringStatus"]) ?? "completed", scoringError: row.scoring_error == null ? null : String(row.scoring_error),
    listingStatus: (row.listing_status as Job["listingStatus"]) ?? "unknown", listingStatusSource: row.listing_status_source == null ? null : String(row.listing_status_source),
    listingCheckedAt: row.listing_checked_at == null ? null : String(row.listing_checked_at), listingClosedAt: row.listing_closed_at == null ? null : String(row.listing_closed_at),
    languageRequirement: String(row.language_requirement), salaryMin: row.salary_min == null ? null : Number(row.salary_min), salaryMax: row.salary_max == null ? null : Number(row.salary_max), currency: row.currency == null ? null : String(row.currency),
    tags: Array.isArray(row.tags) ? row.tags.map(String) : [], source: String(row.source), sourceUrl: row.source_url == null ? null : String(row.source_url),
    publishedAt: String(row.published_at), capturedAt: String(row.captured_at), summary: String(row.summary), matchReasons: Array.isArray(row.match_reasons) ? row.match_reasons.map(String) : [], blockers: Array.isArray(row.blockers) ? row.blockers.map(String) : [], jdText: row.jd_text == null ? undefined : String(row.jd_text),
    jdQuality: (row.jd_quality as Job["jdQuality"]) ?? "full", parserVersion: row.parser_version == null ? null : String(row.parser_version),
  };
}
