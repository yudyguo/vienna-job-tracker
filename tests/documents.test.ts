import { describe, expect, it } from "vitest";
import { renderCoverLetterTypst, renderResumeTypst } from "@/lib/documents/typst";
import { coverLetterDocx, resumeDocx } from "@/lib/documents/docx";

const resume = { headline: "Product Designer", summary: "Evidence-led product design for complex workflows.", experience: [{ company: "Example", role: "Designer", period: "2022–2026", factIds: ["fact-1"], bullets: [{ text: "Shipped 50+ features.", factIds: ["fact-1"] }] }], skills: [{ text: "Research", factIds: ["fact-1"] }, { text: "Systems", factIds: ["fact-1"] }], education: [{ text: "Design degree", factIds: ["fact-1"] }], factIds: ["fact-1"] };
const letter = { language: "en" as const, subject: "Application — Product Designer", greeting: "Dear Hiring Team,", paragraphs: [{ text: "I bring evidence-led product practice.", factIds: ["fact-1"] }, { text: "My work connects research to delivery.", factIds: ["fact-1"] }], closing: "Kind regards,", factIds: ["fact-1"] };

describe("document renderers", () => {
  it("creates self-contained Typst sources", () => {
    expect(renderResumeTypst(resume, "hallmark")).toContain("YADI GUO");
    expect(renderCoverLetterTypst(letter, "Example")).toContain("Dear Hiring Team");
  });

  it("creates valid DOCX zip buffers", async () => {
    const [resumeBuffer, letterBuffer] = await Promise.all([resumeDocx(resume), coverLetterDocx(letter, "Example")]);
    expect(resumeBuffer.subarray(0, 2).toString()).toBe("PK");
    expect(letterBuffer.subarray(0, 2).toString()).toBe("PK");
  });
});
