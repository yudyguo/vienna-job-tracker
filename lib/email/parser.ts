import { htmlToText } from "html-to-text";

export const EMAIL_PARSER_VERSION = "gmail-mime-2026-08-11.5";

export interface GmailPayloadPart {
  mimeType?: string;
  filename?: string;
  headers?: Array<{ name: string; value: string }>;
  body?: { data?: string; size?: number; attachmentId?: string };
  parts?: GmailPayloadPart[];
}

export interface ParsedEmailBody {
  text: string;
  links: string[];
  usedMimeType: "text/plain" | "text/html" | "none";
  parserVersion: string;
}

function decodeBase64Url(value?: string) {
  if (!value) return "";
  return Buffer.from(value.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8");
}

function meaningfulBody(part: GmailPayloadPart): { mimeType: "text/plain" | "text/html"; value: string } | null {
  if (part.filename || part.body?.attachmentId) return null;
  const mime = (part.mimeType ?? "").toLowerCase();
  const children = part.parts ?? [];

  if (mime.startsWith("multipart/alternative")) {
    for (const preferred of ["text/plain", "text/html"] as const) {
      for (const child of children) {
        const result = meaningfulBody(child);
        if (result?.mimeType === preferred && result.value.trim()) return result;
      }
    }
    return null;
  }

  if (mime.startsWith("multipart/")) {
    for (const child of children) {
      const result = meaningfulBody(child);
      if (result?.value.trim()) return result;
    }
    return null;
  }

  if ((mime === "text/plain" || mime === "text/html") && part.body?.data) {
    return { mimeType: mime, value: decodeBase64Url(part.body.data) };
  }
  return null;
}

function normalizeUrl(value: string) {
  try {
    const url = new URL(value.replace(/&amp;/g, "&"));
    const linkedInJob = url.hostname.toLowerCase().endsWith("linkedin.com")
      ? url.pathname.match(/\/(?:comm\/)?jobs\/view\/(\d+)/i)
      : null;
    if (linkedInJob?.[1]) return `https://www.linkedin.com/jobs/view/${linkedInJob[1]}/`;
    for (const key of [...url.searchParams.keys()]) {
      if (/^(utm_|trk|tracking|trackingId|lipi|midToken|midSig|eid|refId|src|mc_|otpToken|origin|originToLandingJobPostings)/i.test(key)) url.searchParams.delete(key);
    }
    url.hash = "";
    return url.toString();
  } catch {
    return value;
  }
}

function extractLinks(value: string) {
  const links = value.match(/https?:\/\/[^\s<>"')\]]+/gi) ?? [];
  return [...new Set(links.map((link) => normalizeUrl(link.replace(/[.,;:]+$/, ""))))].slice(0, 40);
}

function stripQuotedHistory(text: string) {
  const lines = text.split("\n");
  const stop = lines.findIndex((line) =>
    /^(On .+wrote:|Am .+schrieb .+:|From:\s|Von:\s|-{2,}\s*Original Message\s*-{2,})/i.test(line.trim()),
  );
  return stop >= 0 ? lines.slice(0, stop).join("\n") : text;
}

function stripFooter(text: string) {
  const lines = text.split("\n");
  const footer = lines.findIndex((line, index) => index > 2 && /^(unsubscribe|abbestellen|manage (your )?preferences|privacy policy|help center|this email was sent to|you are receiving this|linkedin corporation|©\s*\d{4})/i.test(line.trim()));
  return footer >= 0 ? lines.slice(0, footer).join("\n") : text;
}

export function cleanEmailText(value: string) {
  return stripFooter(stripQuotedHistory(value))
    .replace(/[\u200B-\u200D\u2060\uFEFF]/g, "")
    .replace(/\r\n?/g, "\n")
    .replace(/^\s*(?:[.#][\w-]+|@media[^\n{]*)\s*\{[^\n]*$/gim, "")
    .replace(/^\s*(?:font-family|font-size|line-height|display|padding|margin|color|background|width|height|border)[^\n]*$/gim, "")
    .replace(/\n[ \t]+/g, "\n")
    .replace(/[ \t]{2,}/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
    .slice(0, 60_000);
}

export function parseGmailPayload(payload: GmailPayloadPart): ParsedEmailBody {
  const body = meaningfulBody(payload);
  if (!body) return { text: "", links: [], usedMimeType: "none", parserVersion: EMAIL_PARSER_VERSION };
  const rawLinks = extractLinks(body.value);
  const containsHtmlDocument = /<(?:!doctype|html|head|style|script|body)\b/i.test(body.value);
  const converted = body.mimeType === "text/html" || containsHtmlDocument
    ? htmlToText(body.value, {
        wordwrap: false,
        preserveNewlines: true,
        selectors: [
          { selector: "style", format: "skip" },
          { selector: "script", format: "skip" },
          { selector: "noscript", format: "skip" },
          { selector: "head", format: "skip" },
          { selector: "svg", format: "skip" },
          { selector: "img", format: "skip" },
          { selector: "a", options: { hideLinkHrefIfSameAsText: true, ignoreHref: true } },
        ],
      })
    : body.value;
  return {
    text: cleanEmailText(converted),
    links: [...new Set([...rawLinks, ...extractLinks(converted)])],
    usedMimeType: body.mimeType,
    parserVersion: EMAIL_PARSER_VERSION,
  };
}

export function parseMailboxAddress(value: string) {
  const match = value.match(/^(.*?)\s*<([^>]+)>$/);
  return match
    ? { name: match[1].replace(/^"|"$/g, "").trim() || null, email: match[2].trim().toLowerCase() }
    : { name: null, email: value.trim().toLowerCase() };
}

export function gmailWebUrl(messageId: string) {
  return `https://mail.google.com/mail/u/0/#all/${encodeURIComponent(messageId)}`;
}

export function pickPrimaryJobUrl(links: string[], source: string) {
  const rules = source.toLowerCase().includes("linkedin")
    ? [/linkedin\.com\/comm\/jobs\/view/i, /linkedin\.com\/jobs\/view/i]
    : source.toLowerCase().includes("stepstone")
      ? [/stepstone\./i]
      : source.toLowerCase().includes("xing")
        ? [/xing\.com\/jobs/i]
        : [/jobs?|careers?|greenhouse|lever|ashby/i];
  return links.find((link) => rules.some((rule) => rule.test(link))) ?? links[0] ?? null;
}

function meaningfulAlertLines(body: string) {
  return body
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line && !/^-{5,}$/.test(line));
}

function isLinkedInViewLine(line: string) {
  return /^(?:view job|see job|stelle ansehen|job ansehen)\s*:/i.test(line)
    && /linkedin\.com\/(?:comm\/)?jobs\/view\//i.test(line);
}

function isAlertScaffolding(line: string) {
  return /^(?:(?:a )?new jobs? match(?:es)?|your job alert|stellenalarm|recommendations? based|expand your search|jobs? similar to|see all jobs|view all jobs|ui jobs?|product jobs?)\b/i.test(line)
    || /https?:\/\//i.test(line);
}

function cleanIdentityField(value: string) {
  return value.replace(/\s+/g, " ").trim().slice(0, 180);
}

function linkedInPrimaryCard(body: string, links: string[]) {
  const lines = meaningfulAlertLines(body);
  const markerIndex = lines.findIndex(isLinkedInViewLine);
  if (markerIndex < 0) return null;
  const candidates = lines
    .slice(Math.max(0, markerIndex - 10), markerIndex)
    .filter((line) => !isAlertScaffolding(line));
  if (candidates.length < 3) return null;
  const [title, company, location] = candidates.slice(0, 3).map(cleanIdentityField);
  if (!title || !company || !location || /https?:\/\//i.test(`${title} ${company} ${location}`)) return null;
  const markerUrl = extractLinks(lines[markerIndex])[0];
  const sourceUrl = markerUrl ?? pickPrimaryJobUrl(links, "linkedin");
  return {
    title,
    company,
    location,
    sourceUrl,
    summaryText: [
      "LinkedIn job-alert summary — full job description not included.",
      `Title: ${title}`,
      `Company: ${company}`,
      `Location: ${location}`,
      sourceUrl ? `Original job: ${sourceUrl}` : null,
    ].filter(Boolean).join("\n"),
  };
}

export function parseAlertJobSummary(subject: string, sender: string, body: string, links: string[]) {
  const linkedIn = /linkedin/i.test(sender) ? linkedInPrimaryCard(body, links) : null;
  if (linkedIn) return linkedIn;
  const identity = parseAlertIdentity(subject, sender, body);
  const sourceUrl = pickPrimaryJobUrl(links, sender);
  return {
    ...identity,
    sourceUrl,
    summaryText: [
      "Job-alert summary — full job description not included.",
      `Title: ${identity.title}`,
      `Company: ${identity.company}`,
      `Location: ${identity.location}`,
      sourceUrl ? `Original job: ${sourceUrl}` : null,
    ].filter(Boolean).join("\n"),
  };
}

export function parseAlertIdentity(subject: string, sender: string, body: string) {
  const subjectMatch = subject.match(/^(.+?)\s+(?:at|bei)\s+(.+?)(?:\s*[|–—-].*)?$/i);
  const title = subjectMatch?.[1]?.trim() || subject.replace(/^(new job:?|job alert:?|stellenalarm:?)/i, "").trim() || "Job alert";
  const company = subjectMatch?.[2]?.trim() || sender.replace(/\s*(job alerts?|stellenalarm).*$/i, "").trim() || "Unknown company";
  const nearby = body.split("\n").map((line) => line.trim()).filter(Boolean).slice(0, 35);
  const location = nearby.find((line) => line.length <= 180 && !/https?:\/\/|^(?:your job alert|see all jobs|view all jobs)/i.test(line) && /\b(Vienna|Wien|Austria|Österreich|European Union|EU Remote|Remote)\b/i.test(line))
    ?? (/\b(Vienna|Wien)\b/i.test(body) ? "Vienna, Austria" : /\b(Austria|Österreich)\b/i.test(body) ? "Austria" : "EU Remote / Not specified");
  return { title, company, location };
}

export function isCssContaminated(text: string) {
  const cssSignals = (text.match(/(?:font-family|@media|\.\w+[\w-]*\s*\{|display:\s*(?:block|flex|none)|mso-)/gi) ?? []).length;
  return cssSignals >= 2;
}
