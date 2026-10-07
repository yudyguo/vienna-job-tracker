import { describe, expect, it } from "vitest";
import { applicationEmailClassificationSchema, extractedJobSchema, matchFactsSchema, materialBundleSchema, normalizeApplicationEmailClassification, normalizeMaterialPayload } from "@/lib/ai/schemas";

describe("DeepSeek extraction schema", () => {
  it("accepts an omitted summary so the provider can use a JD-derived fallback", () => {
    const parsed = extractedJobSchema.parse({});
    expect(parsed.summary).toBe("");
    expect(parsed.remotePolicy).toBe("Not specified");
    expect(parsed.skills).toEqual([]);
  });

  it("treats omitted fact-match arrays as empty evidence instead of inventing values", () => {
    expect(matchFactsSchema.parse({})).toEqual({ factIds: [], reasons: [], gaps: [] });
  });

  it("clamps verbose match explanations without paying for another model retry", () => {
    const parsed = matchFactsSchema.parse({ reasons: Array.from({ length: 12 }, (_, index) => `reason-${index}`) });
    expect(parsed.reasons).toHaveLength(8);
  });

  it("uses the verified target title when DeepSeek omits resume.headline", () => {
    const value = normalizeMaterialPayload({ resume: { summary: "Evidence-based professional summary.", experience: [{ company: "Tencent", role: "Designer", period: "2021", factIds: ["fact-1"], bullets: [{ text: "Built workflows", factIds: ["fact-1"] }] }], skills: [], education: [], factIds: ["fact-1"] }, coverLetter: { language: "en", subject: "Application", greeting: "Dear Hiring Team", paragraphs: [{ text: "Evidence paragraph one", factIds: ["fact-1"] }, { text: "Evidence paragraph two", factIds: ["fact-1"] }], closing: "Kind regards", factIds: ["fact-1"] } }, "Product Designer");
    expect(materialBundleSchema.parse(value).resume.headline).toBe("Product Designer");
  });

  it("normalizes optional email deadlines without failing the whole message", () => {
    const base = { classification: "next_step", confidence: 0.82, company: null, title: null, nextAction: "Reply" };
    expect(applicationEmailClassificationSchema.parse(normalizeApplicationEmailClassification({ ...base, nextActionAt: "2026-08-20 10:30" })).nextActionAt).toBe(new Date("2026-08-20 10:30").toISOString());
    expect(applicationEmailClassificationSchema.parse(normalizeApplicationEmailClassification({ ...base, nextActionAt: "not specified" })).nextActionAt).toBeNull();
  });
});
