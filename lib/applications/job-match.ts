export interface MatchableJob {
  id: string;
  title: string;
  company: string;
  source?: string | null;
  publishedAt?: string | null;
  hasApplication?: boolean;
}

export interface ExistingJobMatch {
  jobId: string;
  confidence: number;
  reason: "title_company" | "title" | "company";
}

export interface PlaceholderApplicationMessage {
  senderEmail: string;
  receivedAt: string;
}

export interface PlaceholderMatchableJob extends MatchableJob {
  applicationMessages: PlaceholderApplicationMessage[];
}

export const APPLICATION_MATCHER_VERSION = "application-match-2026-08-18.1";

const platformCompanies = new Set([
  "ashby", "ashbyhq", "greenhouse", "indeed", "lever", "onlyfy", "personio",
  "smartrecruiters", "stepstone", "teamtailor", "workable", "xing",
]);

function normalize(value?: string | null) {
  return (value ?? "")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

export function normalizeCompany(value?: string | null) {
  return normalize(value)
    .replace(/\b(gmbh|mbh|ag|inc|incorporated|ltd|limited|llc|kg|og|group|holding|holdings|recruiting|recruitment|careers?|jobs?|team)\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function normalizeJobTitle(value?: string | null) {
  if (/^(?:待认领的申请职位|职位名称待补充|application to claim)$/i.test((value ?? "").trim())) return "";
  const title = normalize(value)
    .replace(/\b(m f d|f m d|m w d|w m d|all genders|gn)\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!title || /^(a |the |die |eine )?(position|role|stelle|job)( of)?$/.test(title)) return "";
  return title;
}

export function isPlatformCompany(value?: string | null) {
  const company = normalizeCompany(value);
  return platformCompanies.has(company) || [...platformCompanies].some((platform) => company === `${platform} com`);
}

function emailDomain(value?: string | null) {
  return value?.trim().toLowerCase().split("@")[1] ?? "";
}

export function selectPlaceholderCompanyMatch(input: {
  title?: string | null;
  company?: string | null;
  senderEmail?: string | null;
  receivedAt?: string | null;
  jobs: PlaceholderMatchableJob[];
}): ExistingJobMatch | null {
  const company = normalizeCompany(input.company);
  const senderDomain = emailDomain(input.senderEmail);
  const receivedAt = input.receivedAt ? new Date(input.receivedAt).getTime() : Number.NaN;
  if (!company || isPlatformCompany(input.company) || !senderDomain || !Number.isFinite(receivedAt)) return null;

  const candidates = input.jobs.filter((job) => {
    if (job.source !== "gmail_application" || normalizeCompany(job.company) !== company || normalizeJobTitle(job.title)) return false;
    return job.applicationMessages.some((message) => {
      const priorAt = new Date(message.receivedAt).getTime();
      const age = receivedAt - priorAt;
      return emailDomain(message.senderEmail) === senderDomain
        && Number.isFinite(priorAt)
        && age >= 0
        && age <= 180 * 86_400_000;
    });
  });

  return candidates.length === 1
    ? { jobId: candidates[0].id, confidence: 0.96, reason: "company" }
    : null;
}

function tokenSimilarity(left: string, right: string) {
  if (!left || !right) return 0;
  if (left === right) return 1;
  const leftTokens = new Set(left.split(" ").filter((token) => token.length > 1));
  const rightTokens = new Set(right.split(" ").filter((token) => token.length > 1));
  const intersection = [...leftTokens].filter((token) => rightTokens.has(token)).length;
  return intersection / Math.max(leftTokens.size, rightTokens.size, 1);
}

function companyOnlyIsSafe(job: MatchableJob, receivedAt?: string | null) {
  if (job.hasApplication) return true;
  if (!job.publishedAt || !receivedAt) return false;
  const age = new Date(receivedAt).getTime() - new Date(job.publishedAt).getTime();
  return Number.isFinite(age) && age >= -86_400_000 && age <= 180 * 86_400_000;
}

export function selectExistingJobMatch(input: {
  title?: string | null;
  company?: string | null;
  receivedAt?: string | null;
  jobs: MatchableJob[];
}): ExistingJobMatch | null {
  const title = normalizeJobTitle(input.title);
  const rawCompany = input.company;
  const company = isPlatformCompany(rawCompany) ? "" : normalizeCompany(rawCompany);
  const candidates = input.jobs.filter((job) => job.source !== "gmail_application");
  const exactCompanyCandidates = company
    ? candidates.filter((job) => normalizeCompany(job.company) === company)
    : [];
  const exactTitleCandidates = title
    ? candidates.filter((job) => normalizeJobTitle(job.title) === title)
    : [];
  const scored = candidates.flatMap((job) => {
    const jobTitle = normalizeJobTitle(job.title);
    const jobCompany = normalizeCompany(job.company);
    const titleSimilarity = tokenSimilarity(title, jobTitle);
    const companySimilarity = tokenSimilarity(company, jobCompany);
    const titleExact = Boolean(title && title === jobTitle);
    const companyExact = Boolean(company && company === jobCompany);
    let confidence = 0;
    let reason: ExistingJobMatch["reason"] = "title_company";

    if (titleExact && companyExact) confidence = 0.99;
    else if ((titleExact && companySimilarity >= 0.75) || (companyExact && titleSimilarity >= 0.75)) confidence = 0.97;
    else if (titleSimilarity >= 0.8 && companySimilarity >= 0.8) confidence = 0.95;
    else if (!company && titleExact && exactTitleCandidates.length === 1 && job.hasApplication) { confidence = 0.91; reason = "title"; }
    else if (companyExact && exactCompanyCandidates.length === 1 && companyOnlyIsSafe(job, input.receivedAt)) { confidence = 0.92; reason = "company"; }

    return confidence ? [{ jobId: job.id, confidence, reason }] : [];
  }).sort((left, right) => right.confidence - left.confidence);

  const best = scored[0];
  if (!best) return null;
  const tied = scored.filter((match) => match.confidence === best.confidence);
  if (tied.length > 1) return null;
  return best;
}
