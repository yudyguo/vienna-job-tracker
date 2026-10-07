import { describe, expect, it } from "vitest";
import { canonicalJobKey, scoreJob } from "@/lib/scoring";
import type { CandidateFact } from "@/lib/types";

const fact: CandidateFact = { id: "fact-ux", category: "skill", label: "UX", value: "workflow research", evidence: "CV", verified: true, source: "CV" };

describe("job scoring guardrails", () => {
  it("keeps a 79-point role out of the generation queue", () => {
    const result = scoreJob({ title: "UX Designer", description: "workflow research", location: "Vienna", publishedAt: new Date().toISOString() }, [fact]);
    expect(result.score).toBe(79);
  });

  it("allows an exact 80-point role", () => {
    const result = scoreJob({ title: "Product Designer UX", description: "workflow research", location: "Vienna", publishedAt: new Date(Date.now() - 30 * 86_400_000).toISOString() }, [fact]);
    expect(result.score).toBe(80);
    expect(result.blockers).toEqual([]);
  });

  it("accepts German B2 but blocks C1", () => {
    const base = { title: "UX Designer", description: "workflow research", location: "Vienna" };
    expect(scoreJob({ ...base, languageRequirement: "German B2" }, [fact]).blockers).toEqual([]);
    expect(scoreJob({ ...base, languageRequirement: "German C1 required" }, [fact]).blockers).toContain("German C1/C2 required");
  });

  it("caps summary-only email jobs at 69 and removes evidence points", () => {
    const result = scoreJob({ title: "Product Designer UX", description: "workflow research Figma product design", location: "Vienna", publishedAt: new Date().toISOString(), jdQuality: "summary" }, [fact]);
    expect(result.score).toBeLessThanOrEqual(69);
    expect(result.components.evidence).toBe(0);
  });

  it("deduplicates tracking variants of the same URL", () => {
    const first = canonicalJobKey({ company: "Acme", title: "Designer", location: "Vienna", sourceUrl: "https://example.com/jobs/1?utm_source=mail#apply" });
    const second = canonicalJobKey({ company: "Acme", title: "Designer", location: "Vienna", sourceUrl: "https://example.com/jobs/1" });
    expect(first).toBe(second);
  });
});
