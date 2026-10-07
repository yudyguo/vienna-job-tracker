import { mkdir, writeFile } from "node:fs/promises";
import { resumeDocx, coverLetterDocx } from "../lib/documents/docx.ts";

const output = process.argv[2];
if (!output) throw new Error("Provide an output directory.");
await mkdir(output, { recursive: true });

const factIds = ["fact-tencent-role", "fact-tencent-delivery"];
const resume = {
  headline: "Product & UX Designer · B2B Systems",
  summary: "Product-oriented designer with evidence across complex platforms and consumer health products.",
  experience: [{ company: "Tencent", role: "Interaction Designer", period: "2021 to 2023", factIds, bullets: [{ text: "Translated complex merchant and service needs into reusable flows and detailed requirements, contributing to more than 50 delivered features.", factIds }] }],
  skills: [{ text: "Discovery · Workflow mapping · Usability testing", factIds: ["fact-product-skills"] }],
  education: [{ text: "M.S. Human-Computer Interaction · Sun Yat-Sen University · 2021", factIds: ["fact-education-ms"] }],
  factIds,
};
const letter = {
  language: "en",
  subject: "Application — Product Designer",
  greeting: "Dear Hiring Team,",
  paragraphs: [
    { text: "I am applying for the Product Designer role with a background connecting research, product definition and cross-functional delivery.", factIds: ["fact-years-4", "fact-product-skills"] },
    { text: "At Tencent, I translated complex stakeholder needs into reusable flows and detailed requirements while contributing to more than 50 delivered features.", factIds },
  ],
  closing: "Kind regards,",
  factIds,
};

await writeFile(`${output}/sample-resume.docx`, await resumeDocx(resume));
await writeFile(`${output}/sample-cover-letter.docx`, await coverLetterDocx(letter, "Example Vienna Team"));
