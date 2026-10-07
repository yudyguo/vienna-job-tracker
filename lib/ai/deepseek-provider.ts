import "server-only";
import { env } from "@/lib/env";
import { getSupabaseAdmin } from "@/lib/supabase/server";
import type { ApplicationEmailClassification, ExtractedJob, FactMatch } from "@/lib/ai/schemas";
import {
  applicationEmailClassificationSchema,
  extractedJobSchema,
  matchFactsSchema,
  materialBundleSchema,
  normalizeApplicationEmailClassification,
  normalizeMaterialPayload,
  preparationPackSchema,
} from "@/lib/ai/schemas";
import type { CandidateFact, Job, MaterialBundleContent, PreparationPackContent } from "@/lib/types";
import type { ZodType } from "zod";

interface AiProvider {
  extractJob(input: { title: string; company: string; location: string; jdText: string }): Promise<ExtractedJob>;
  matchFacts(job: Pick<Job, "title" | "company" | "summary" | "jdText">, facts: CandidateFact[]): Promise<FactMatch>;
  generateMaterials(job: Job, facts: CandidateFact[], options?: { deepRewrite?: boolean }): Promise<MaterialBundleContent>;
  classifyApplicationEmail(input: { subject: string; sender: string; bodyText: string; receivedAt: string }): Promise<ApplicationEmailClassification>;
  generatePreparationPack(job: Job, facts: CandidateFact[], emailContext: string): Promise<PreparationPackContent>;
}

type ChatResponse = {
  id?: string;
  choices?: Array<{ message?: { content?: string | null } }>;
  usage?: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number };
};

export const PROMPT_VERSION = "materials-2026-08-11.2";
export const EMAIL_PROMPT_VERSION = "application-email-2026-08-11.2";
export const PREPARATION_PROMPT_VERSION = "preparation-2026-08-11.1";

const MATERIAL_EXAMPLE = JSON.stringify({
  resume: {
    headline: "Target role title",
    summary: "Evidence-based professional summary.",
    experience: [{ company: "Verified company", role: "Verified role", period: "Verified period", factIds: ["fact-id"], bullets: [{ text: "Verified achievement.", factIds: ["fact-id"] }] }],
    skills: [{ text: "Verified skill", factIds: ["fact-id"] }],
    education: [{ text: "Verified education", factIds: ["fact-id"] }],
    factIds: ["fact-id"],
  },
  coverLetter: {
    language: "en",
    subject: "Application for target role",
    greeting: "Dear Hiring Team,",
    paragraphs: [{ text: "Evidence-backed paragraph.", factIds: ["fact-id"] }, { text: "Evidence-backed paragraph.", factIds: ["fact-id"] }],
    closing: "Kind regards,\nYadi Guo",
    factIds: ["fact-id"],
  },
});

function assertFactReferences(bundle: MaterialBundleContent, facts: CandidateFact[]) {
  const allowed = new Set(facts.filter((fact) => fact.verified).map((fact) => fact.id));
  const references = new Set([
    ...bundle.resume.factIds,
    ...bundle.resume.experience.flatMap((item) => item.factIds),
    ...bundle.resume.experience.flatMap((item) => item.bullets.flatMap((bullet) => bullet.factIds)),
    ...bundle.resume.skills.flatMap((item) => item.factIds),
    ...bundle.resume.education.flatMap((item) => item.factIds),
    ...bundle.coverLetter.factIds,
    ...bundle.coverLetter.paragraphs.flatMap((paragraph) => paragraph.factIds),
    ...(bundle.englishReviewCopy?.factIds ?? []),
    ...(bundle.englishReviewCopy?.paragraphs.flatMap((paragraph) => paragraph.factIds) ?? []),
  ]);
  const invalid = [...references].filter((id) => !allowed.has(id));
  if (invalid.length) throw new Error(`Model cited unverified CandidateFact IDs: ${invalid.join(", ")}`);
}

function validationError(schema: ZodType<unknown>, value: unknown) {
  const parsed = schema.safeParse(value);
  if (parsed.success) return null;
  const issue = parsed.error.issues[0];
  const path = issue?.path.length ? issue.path.join(".") : "root";
  return { path, message: issue?.message ?? "unknown error" };
}

async function recordAttempt(input: {
  operation: string;
  model: string;
  promptVersion: string;
  attempt: number;
  status: "completed" | "failed";
  durationMs: number;
  requestId?: string;
  usage?: ChatResponse["usage"];
  errorPath?: string;
  jobId?: string;
  applicationId?: string;
}) {
  const supabase = getSupabaseAdmin();
  if (!supabase) return;
  await supabase.from("ai_generation_attempts").insert({
    operation: input.operation,
    model: input.model,
    prompt_version: input.promptVersion,
    attempt: input.attempt,
    status: input.status,
    duration_ms: input.durationMs,
    request_id: input.requestId ?? null,
    token_usage: input.usage ?? {},
    error_path: input.errorPath ?? null,
    job_id: input.jobId ?? null,
    application_id: input.applicationId ?? null,
  });
}

export class DeepSeekProvider implements AiProvider {
  private async json<T>(input: {
    model: string;
    system: string;
    user: string;
    schema: ZodType<T>;
    example: string;
    promptVersion: string;
    operation: string;
    maxTokens?: number;
    deepRewrite?: boolean;
    jobId?: string;
    applicationId?: string;
    normalize?: (value: unknown) => unknown;
  }): Promise<T> {
    if (!env.DEEPSEEK_API_KEY) throw new Error("DEEPSEEK_API_KEY is not configured.");
    let repair = "";
    let lastError = new Error("DeepSeek request failed.");
    for (let attempt = 1; attempt <= 2; attempt += 1) {
      const started = Date.now();
      let responsePayload: ChatResponse | undefined;
      let errorPath: string | undefined;
      try {
        const response = await fetch(`${env.DEEPSEEK_BASE_URL}/chat/completions`, {
          method: "POST",
          headers: { authorization: `Bearer ${env.DEEPSEEK_API_KEY}`, "content-type": "application/json" },
          body: JSON.stringify({
            model: input.model,
            messages: [
              { role: "system", content: `${input.system}\nReturn valid JSON only. The complete required JSON shape is:\n${input.example}${repair}` },
              { role: "user", content: input.user },
            ],
            response_format: { type: "json_object" },
            max_tokens: input.maxTokens ?? 4096,
            temperature: 0.2,
            thinking: { type: input.deepRewrite ? "enabled" : "disabled" },
          }),
          signal: AbortSignal.timeout(45_000),
        });
        responsePayload = (await response.json().catch(() => ({}))) as ChatResponse;
        if (!response.ok) throw new Error(`DeepSeek request failed with status ${response.status}.`);
        const content = responsePayload.choices?.[0]?.message?.content;
        if (!content) throw new Error("DeepSeek returned an empty response.");
        let value: unknown;
        try { value = JSON.parse(content); } catch { throw new Error("DeepSeek returned invalid JSON."); }
        value = input.normalize ? input.normalize(value) : value;
        const issue = validationError(input.schema, value);
        if (issue) {
          errorPath = issue.path;
          repair = `\nYour previous response was rejected at ${issue.path}: ${issue.message}. On this retry include that field and every field shown in the complete example. Do not omit keys or return prose.`;
          throw new Error(`DeepSeek response failed schema validation at ${issue.path}: ${issue.message}`);
        }
        const result = input.schema.parse(value);
        await recordAttempt({ operation: input.operation, model: input.model, promptVersion: input.promptVersion, attempt, status: "completed", durationMs: Date.now() - started, requestId: responsePayload.id, usage: responsePayload.usage, jobId: input.jobId, applicationId: input.applicationId });
        console.info("ai_generation", { model: input.model, durationMs: Date.now() - started, status: "ok", attempt, promptVersion: input.promptVersion });
        return result;
      } catch (error) {
        lastError = error instanceof Error ? error : new Error("DeepSeek request failed.");
        await recordAttempt({ operation: input.operation, model: input.model, promptVersion: input.promptVersion, attempt, status: "failed", durationMs: Date.now() - started, requestId: responsePayload?.id, usage: responsePayload?.usage, errorPath, jobId: input.jobId, applicationId: input.applicationId });
        console.warn("ai_generation", { model: input.model, durationMs: Date.now() - started, status: "error", attempt, promptVersion: input.promptVersion, error: lastError.message });
      }
    }
    throw lastError;
  }

  extractJob(input: { title: string; company: string; location: string; jdText: string }) {
    const example = JSON.stringify({ summary: "factual summary", remotePolicy: "Not specified", languageRequirement: "Not specified", salaryMin: null, salaryMax: null, currency: null, yearsRequired: null, employmentType: null, skills: [], hardRequirements: [], publishedAt: null, isGermanJd: false });
    return this.json({
      model: env.DEEPSEEK_FAST_MODEL,
      system: "Extract only information explicitly present in the job description. Use null for absent nullable values, 'Not specified' for absent string values, and [] for absent arrays. Never infer language, salary, dates, or years.",
      user: `JSON extraction request\nTitle: ${input.title}\nCompany: ${input.company}\nLocation: ${input.location}\nJob description:\n${input.jdText}`,
      schema: extractedJobSchema,
      example,
      promptVersion: "job-extraction-2026-08-11.1",
      operation: "extract_job",
    }).then((extracted) => ({ ...extracted, summary: extracted.summary || input.jdText.replace(/\s+/g, " ").trim().slice(0, 420) }));
  }

  matchFacts(job: Pick<Job, "title" | "company" | "summary" | "jdText">, facts: CandidateFact[]) {
    const verified = facts.filter((fact) => fact.verified);
    return this.json({
      model: env.DEEPSEEK_FAST_MODEL,
      system: "Match requirements only to supplied verified facts. Copy fact IDs exactly. Never invent evidence, metrics, employers, skills, education, dates, or language levels.",
      user: `JSON matching request\nJob: ${job.title} at ${job.company}\n${job.summary}\n${job.jdText ?? ""}\nVerified facts:\n${JSON.stringify(verified)}`,
      schema: matchFactsSchema,
      example: JSON.stringify({ factIds: [], reasons: [], gaps: [] }),
      promptVersion: "fact-match-2026-08-11.1",
      operation: "match_facts",
    }).then((match) => ({ ...match, factIds: match.factIds.filter((id) => verified.some((fact) => fact.id === id)) }));
  }

  async generateMaterials(job: Job, facts: CandidateFact[], options?: { deepRewrite?: boolean }) {
    const verified = facts.filter((fact) => fact.verified);
    const bundle = await this.json({
      model: env.DEEPSEEK_QUALITY_MODEL,
      system: "Generate a concise ATS-friendly resume and cover letter draft. Every experience, skill, education item, bullet and paragraph must cite exact CandidateFact IDs. Do not invent or amplify facts. For a German JD, write the formal cover letter in German and include englishReviewCopy with the same evidence.",
      user: `JSON materials request\nJob:\n${JSON.stringify(job)}\nVerified CandidateFacts:\n${JSON.stringify(verified)}`,
      schema: materialBundleSchema,
      example: MATERIAL_EXAMPLE,
      promptVersion: PROMPT_VERSION,
      operation: "generate_materials",
      maxTokens: 8192,
      deepRewrite: options?.deepRewrite,
      jobId: job.id,
      normalize: (value) => normalizeMaterialPayload(value, job.title),
    });
    assertFactReferences(bundle, verified);
    return bundle;
  }

  classifyApplicationEmail(input: { subject: string; sender: string; bodyText: string; receivedAt: string }) {
    return this.json({
      model: env.DEEPSEEK_FAST_MODEL,
      system: "Classify one employment application email. acknowledgement means receipt confirmation; interview means interview/recruiter screen; task means assignment/case study; offer means an explicit offer; rejection means an explicit rejection; next_step means a positive but ambiguous next step; other means unrelated or unclear. Extract only explicit company, role, action, and deadline. Confidence must reflect ambiguity.",
      user: `Received: ${input.receivedAt}\nSender: ${input.sender}\nSubject: ${input.subject}\nClean body:\n${input.bodyText}`,
      schema: applicationEmailClassificationSchema,
      example: JSON.stringify({ classification: "other", confidence: 0.5, company: null, title: null, nextAction: null, nextActionAt: null }),
      promptVersion: EMAIL_PROMPT_VERSION,
      operation: "classify_application_email",
      maxTokens: 1200,
      normalize: normalizeApplicationEmailClassification,
    });
  }

  generatePreparationPack(job: Job, facts: CandidateFact[], emailContext: string) {
    const verified = facts.filter((fact) => fact.verified);
    return this.json({
      model: env.DEEPSEEK_QUALITY_MODEL,
      system: "Create a practical interview or assignment preparation pack. Every STAR story must cite exact verified CandidateFact IDs. Do not invent facts, achievements, deadlines, interviewers, or company information. If the JD is incomplete, keep assessmentAreas and likelyQuestions conservative and focus on email logistics plus verified story frames.",
      user: `Job:\n${JSON.stringify(job)}\nClean application email context:\n${emailContext}\nVerified CandidateFacts:\n${JSON.stringify(verified)}`,
      schema: preparationPackSchema,
      example: JSON.stringify({ summary: "Preparation summary", logistics: [], assessmentAreas: [], starStories: [{ title: "Story", outline: "Situation, task, action and result grounded in facts.", factIds: ["fact-id"] }], likelyQuestions: [], questionsToAsk: [], risks: [], checklist: [] }),
      promptVersion: PREPARATION_PROMPT_VERSION,
      operation: "generate_preparation_pack",
      maxTokens: 5000,
      jobId: job.id,
    });
  }
}

export const deepSeekProvider = new DeepSeekProvider();
