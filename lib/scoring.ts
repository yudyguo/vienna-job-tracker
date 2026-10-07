import type { CandidateFact, JdQuality, Job, RoleTrack } from "@/lib/types";

export interface ScoreInput {
  title: string;
  description: string;
  location: string;
  remotePolicy?: string;
  languageRequirement?: string;
  yearsRequired?: number | null;
  salaryMin?: number | null;
  employmentType?: string | null;
  publishedAt?: string | null;
  jdQuality?: JdQuality;
}

export interface ScoreResult {
  score: number;
  track: RoleTrack;
  components: {
    role: number;
    evidence: number;
    location: number;
    seniority: number;
    language: number;
    contract: number;
    recency: number;
  };
  blockers: string[];
  warnings: string[];
  matchedFactIds: string[];
}

const designTerms = ["product designer", "ux", "ui designer", "service designer", "interaction designer", "design system", "ux researcher"];
const productTerms = ["product manager", "product owner", "business analyst", "product operations", "ai product"];
const excludedTerms = ["intern", "internship", "working student", "werkstudent", "praktikum", "studentische"];

function containsAny(text: string, terms: string[]) {
  return terms.some((term) => text.includes(term));
}

function daysSince(value?: string | null) {
  if (!value) return 30;
  return Math.max(0, (Date.now() - new Date(value).getTime()) / 86_400_000);
}

export function scoreJob(input: ScoreInput, facts: CandidateFact[]): ScoreResult {
  const title = input.title.toLowerCase();
  const body = `${input.title} ${input.description}`.toLowerCase();
  const place = `${input.location} ${input.remotePolicy ?? ""}`.toLowerCase();
  const language = (input.languageRequirement ?? "").toLowerCase();
  const blockers: string[] = [];
  const warnings: string[] = [];

  if (containsAny(title, excludedTerms)) blockers.push("Internship or student role");
  if (/\b(c1|c2|native german|muttersprach)/i.test(language)) blockers.push("German C1/C2 required");
  if ((input.yearsRequired ?? 0) > 5) blockers.push("Experience requirement exceeds 5 years");
  if (/senior|lead|principal|head of/i.test(title) && (input.yearsRequired ?? 6) > 5) blockers.push("Senior scope exceeds target range");
  if (!/(vienna|wien|austria|österreich|remote|european union|eu)/i.test(place)) blockers.push("Location is outside Vienna/Austria/EU-remote scope");
  if (input.salaryMin != null && input.salaryMin < 45_000) warnings.push("Minimum salary is below €45k");

  const designHits = designTerms.filter((term) => body.includes(term)).length;
  const productHits = productTerms.filter((term) => body.includes(term)).length;
  const track: RoleTrack = designHits >= productHits ? "design" : "product";
  const role = Math.min(30, 16 + Math.max(designHits, productHits) * 5);

  const verifiedFacts = facts.filter((fact) => fact.verified);
  const matchedFacts = verifiedFacts.filter((fact) => {
    const words = fact.value.toLowerCase().split(/[^a-z0-9+#]+/).filter((word) => word.length >= 4);
    return words.some((word) => body.includes(word));
  });
  const evidence = input.jdQuality === "summary" || input.jdQuality === "missing"
    ? 0
    : Math.min(25, 9 + matchedFacts.length * 4);

  const location = /vienna|wien/i.test(place) ? 15 : /austria|österreich/i.test(place) ? 14 : /remote|european union|\beu\b/i.test(place) ? 12 : 0;
  const years = input.yearsRequired ?? 3;
  const seniority = years <= 4 ? 10 : years <= 5 ? 8 : 2;
  const languageScore = /c1|c2|native/i.test(language) ? 0 : /b2|german|deutsch/i.test(language) ? 8 : 10;
  const contract = excludedTerms.some((term) => (input.employmentType ?? "").toLowerCase().includes(term)) ? 0 : 5;
  const age = daysSince(input.publishedAt);
  const recency = age <= 3 ? 5 : age <= 7 ? 4 : age <= 14 ? 3 : 1;
  const raw = role + evidence + location + seniority + languageScore + contract + recency;

  const qualityCap = input.jdQuality === "full" || !input.jdQuality ? 100 : 69;
  return {
    score: Math.min(qualityCap, blockers.length ? Math.min(raw, 79) : Math.min(100, raw)),
    track,
    components: { role, evidence, location, seniority, language: languageScore, contract, recency },
    blockers,
    warnings,
    matchedFactIds: matchedFacts.map((fact) => fact.id),
  };
}

export function canonicalJobKey(job: Pick<Job, "company" | "title" | "location" | "sourceUrl">) {
  if (job.sourceUrl) {
    try {
      const url = new URL(job.sourceUrl);
      url.search = "";
      url.hash = "";
      return url.toString().toLowerCase();
    } catch {
      // Fall through to the stable text key.
    }
  }
  return [job.company, job.title, job.location]
    .map((part) => part.toLowerCase().replace(/[^a-z0-9äöüß]+/g, " ").trim())
    .join("|");
}
