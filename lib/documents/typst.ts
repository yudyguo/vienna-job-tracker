import type { GeneratedCoverLetterContent, GeneratedResumeContent } from "@/lib/types";

function typst(value: string) {
  return value.replace(/\\/g, "\\\\").replace(/([#\[\]$@*_<>])/g, "\\$1");
}

function bullets(items: Array<{ text: string }>) {
  return items.map((item) => `- ${typst(item.text)}`).join("\n");
}

export function renderResumeTypst(content: GeneratedResumeContent, style: "ats" | "hallmark") {
  const accent = style === "hallmark" ? "#a34f2d" : "#222222";
  const sections = content.experience.map((item) => `
#grid(columns: (1fr, auto), [*${typst(item.role)} · ${typst(item.company)}*], [${typst(item.period)}])
${bullets(item.bullets)}
`).join("\n");
  return `#set page(paper: "a4", margin: (x: 18mm, y: 16mm))
#set text(font: "Libertinus Serif", size: 9.5pt, fill: rgb("#222222"))
#set par(justify: false, leading: 0.62em)
#show heading: it => block(above: 9pt, below: 5pt, stroke: (bottom: .6pt + rgb("${accent}")))[#set text(size: 11pt, fill: rgb("${accent}")); #upper(it.body)]

#text(size: 22pt, weight: "semibold")[YADI GUO]
#line(length: 100%, stroke: 1pt + rgb("${accent}"))
#text(size: 12pt, fill: rgb("${accent}"))[${typst(content.headline)}]

${typst(content.summary)}

== Experience
${sections}
== Skills
${typst(content.skills.map((item) => item.text).join(" · "))}

== Education
${content.education.map((item) => `- ${typst(item.text)}`).join("\n")}
`;
}

export function renderCoverLetterTypst(content: GeneratedCoverLetterContent, company: string) {
  return `#set page(paper: "a4", margin: (x: 24mm, y: 22mm))
#set text(font: "Libertinus Serif", size: 10.5pt, fill: rgb("#24211f"))
#set par(leading: .8em)
#text(size: 20pt, weight: "semibold")[YADI GUO]
#text(fill: rgb("#a34f2d"))[Product · UX · Vienna]
#line(length: 100%, stroke: .8pt + rgb("#a34f2d"))

#v(16mm)
*${typst(content.subject)}*
${typst(company)}

#v(8mm)
${typst(content.greeting)}

${content.paragraphs.map((paragraph) => typst(paragraph.text)).join("\n\n")}

${typst(content.closing)}

Yadi Guo
`;
}
