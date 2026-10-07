import { AlignmentType, BorderStyle, Document, HeadingLevel, LevelFormat, PageOrientation, Packer, Paragraph, TextRun } from "docx";
import type { GeneratedCoverLetterContent, GeneratedResumeContent } from "@/lib/types";

const copper = "9A4E2F";

function baseDocument(children: Paragraph[]) {
  // compact_reference_guide with named `job_application_a4` overrides:
  // A4, 0.625in margins, Aptos 10pt, 1.15 line spacing, copper section rules.
  return new Document({
    styles: { default: { document: { run: { font: "Aptos", size: 20, color: "282522" }, paragraph: { spacing: { after: 100, line: 276 } } } } },
    numbering: {
      config: [{
        reference: "resume-bullets",
        levels: [{ level: 0, format: LevelFormat.BULLET, text: "•", alignment: AlignmentType.LEFT, style: { paragraph: { indent: { left: 420, hanging: 220 }, spacing: { after: 60, line: 276 } } } }],
      }],
    },
    sections: [{ properties: { page: { size: { width: 11906, height: 16838, orientation: PageOrientation.PORTRAIT }, margin: { top: 900, right: 900, bottom: 900, left: 900, header: 400, footer: 400 } } }, children }],
  });
}

function heading(text: string) {
  return new Paragraph({ heading: HeadingLevel.HEADING_2, spacing: { before: 200, after: 90 }, border: { bottom: { color: copper, style: BorderStyle.SINGLE, size: 6 } }, children: [new TextRun({ text: text.toUpperCase(), bold: true, color: copper, size: 22 })] });
}

export async function resumeDocx(content: GeneratedResumeContent) {
  const children: Paragraph[] = [
    new Paragraph({ alignment: AlignmentType.LEFT, children: [new TextRun({ text: "YADI GUO", bold: true, size: 38 })] }),
    new Paragraph({ children: [new TextRun({ text: content.headline, color: copper, size: 24 })] }),
    new Paragraph({ text: content.summary }),
    heading("Experience"),
  ];
  for (const item of content.experience) {
    children.push(new Paragraph({ children: [new TextRun({ text: `${item.role} · ${item.company}`, bold: true }), new TextRun({ text: `    ${item.period}`, italics: true, color: "66615C" })] }));
    for (const bullet of item.bullets) children.push(new Paragraph({ text: bullet.text, numbering: { reference: "resume-bullets", level: 0 } }));
  }
  children.push(heading("Skills"), new Paragraph({ text: content.skills.map((item) => item.text).join(" · ") }), heading("Education"));
  for (const item of content.education) children.push(new Paragraph({ text: item.text, numbering: { reference: "resume-bullets", level: 0 } }));
  return Packer.toBuffer(baseDocument(children));
}

export async function coverLetterDocx(content: GeneratedCoverLetterContent, company: string) {
  const children = [
    new Paragraph({ children: [new TextRun({ text: "YADI GUO", bold: true, size: 38 })] }),
    new Paragraph({ border: { bottom: { color: copper, style: BorderStyle.SINGLE, size: 8 } }, children: [new TextRun({ text: "Product · UX · Vienna", color: copper })] }),
    new Paragraph({ spacing: { before: 500 }, children: [new TextRun({ text: content.subject, bold: true }), new TextRun({ text: `\n${company}` })] }),
    new Paragraph({ spacing: { before: 260 }, text: content.greeting }),
    ...content.paragraphs.map((paragraph) => new Paragraph({ text: paragraph.text })),
    new Paragraph({ spacing: { before: 220 }, text: content.closing }),
    new Paragraph({ text: "Yadi Guo" }),
  ];
  return Packer.toBuffer(baseDocument(children));
}
