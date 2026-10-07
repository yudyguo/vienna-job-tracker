import { z } from "zod";

export const extractedJobSchema = z.object({
  summary: z.string().trim().min(20).optional().transform((value) => value ?? ""),
  remotePolicy: z.string().default("Not specified"),
  languageRequirement: z.string().default("Not specified"),
  salaryMin: z.number().nullable().default(null),
  salaryMax: z.number().nullable().default(null),
  currency: z.string().nullable().default(null),
  yearsRequired: z.number().nullable().default(null),
  employmentType: z.string().nullable().default(null),
  skills: z.array(z.string()).default([]).transform((items) => items.slice(0, 20)),
  hardRequirements: z.array(z.string()).default([]).transform((items) => items.slice(0, 12)),
  publishedAt: z.string().nullable().default(null),
  isGermanJd: z.boolean().default(false),
});

const citedText = z.object({ text: z.string().min(1), factIds: z.array(z.string()).min(1) });

export const matchFactsSchema = z.object({
  factIds: z.array(z.string()).default([]),
  reasons: z.array(z.string()).default([]).transform((items) => items.slice(0, 8)),
  gaps: z.array(z.string()).default([]).transform((items) => items.slice(0, 8)),
});

export const materialBundleSchema = z.object({
  resume: z.object({
    headline: z.string().min(3),
    summary: z.string().min(20),
    experience: z.array(z.object({
      company: z.string(),
      role: z.string(),
      period: z.string(),
      factIds: z.array(z.string()).min(1),
      bullets: z.array(citedText).min(1).max(6),
    })).min(1).max(5),
    skills: z.array(citedText).max(18),
    education: z.array(citedText).max(5),
    factIds: z.array(z.string()).min(1),
  }),
  coverLetter: z.object({
    language: z.enum(["en", "de"]),
    subject: z.string(),
    greeting: z.string(),
    paragraphs: z.array(citedText).min(2).max(5),
    closing: z.string(),
    factIds: z.array(z.string()).min(1),
  }),
  englishReviewCopy: z.object({
    language: z.literal("en"),
    subject: z.string(),
    greeting: z.string(),
    paragraphs: z.array(citedText).min(2).max(5),
    closing: z.string(),
    factIds: z.array(z.string()).min(1),
  }).optional(),
});

export function normalizeMaterialPayload(value: unknown, fallbackHeadline: string) {
  if (!value || typeof value !== "object") return value;
  const root = value as Record<string, unknown>;
  if (!root.resume || typeof root.resume !== "object") return value;
  const resume = root.resume as Record<string, unknown>;
  if (typeof resume.headline !== "string" || !resume.headline.trim()) resume.headline = fallbackHeadline;
  return value;
}

export const applicationEmailClassificationSchema = z.object({
  classification: z.enum(["acknowledgement", "interview", "task", "offer", "rejection", "next_step", "other"]),
  confidence: z.number().min(0).max(1),
  company: z.string().nullable().default(null),
  title: z.string().nullable().default(null),
  nextAction: z.string().nullable().default(null),
  nextActionAt: z.string().datetime({ offset: true }).nullable().default(null),
});

export function normalizeApplicationEmailClassification(value: unknown) {
  if (!value || typeof value !== "object") return value;
  const root = value as Record<string, unknown>;
  const deadline = root.nextActionAt;
  if (deadline == null || deadline === "") {
    root.nextActionAt = null;
  } else if (typeof deadline === "string") {
    const parsed = new Date(deadline);
    root.nextActionAt = Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
  }
  return root;
}

const starStorySchema = z.object({
  title: z.string().min(1),
  outline: z.string().min(10),
  factIds: z.array(z.string()).min(1),
});

export const preparationPackSchema = z.object({
  summary: z.string().min(10),
  logistics: z.array(z.string()).default([]),
  assessmentAreas: z.array(z.string()).default([]),
  starStories: z.array(starStorySchema).default([]),
  likelyQuestions: z.array(z.string()).default([]),
  questionsToAsk: z.array(z.string()).default([]),
  risks: z.array(z.string()).default([]),
  checklist: z.array(z.string()).default([]),
});

export type ExtractedJob = z.infer<typeof extractedJobSchema>;
export type FactMatch = z.infer<typeof matchFactsSchema>;
export type ApplicationEmailClassification = z.infer<typeof applicationEmailClassificationSchema>;
