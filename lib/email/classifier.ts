import type { ApplicationMessage, ApplicationStage } from "@/lib/types";

export interface HeuristicClassification {
  classification: ApplicationMessage["classification"];
  confidence: number;
  nextAction: string | null;
}

const patterns: Array<{ type: HeuristicClassification["classification"]; confidence: number; pattern: RegExp; nextAction: string | null }> = [
  { type: "rejection", confidence: 0.98, pattern: /will not (?:be )?moving forward|not progress(?:ing)? your application|decided not to proceed|decided to (?:offer|move forward with) another candidate|unsuccessful|(?:unfortunately|we regret).{0,240}(?:not (?:been )?selected|not (?:be )?considered|do not (?:entirely )?match|does not (?:entirely )?match|proceed with other applicants?|qualifications? do not)|(?:application|candidacy).{0,160}(?:not (?:been )?selected|not (?:be )?considered|not moving forward)|bewerbung.{0,120}nicht weiterverfolgen|nicht in die weitere auswahl (?:mit)?aufgenommen|keine positive nachricht (?:geben|mitteilen)|(?:leider|bedauern|müssen (?:wir )?(?:ihnen|dir) leider mitteilen).{0,320}(?:absagen|nicht (?:weiter )?berücksichtigen|nicht weiterführen|nicht weiterverfolgen|nicht in die weitere auswahl|nicht alle (?:kriterien|anforderungen|voraussetzungen) erfüllt|profil.{0,80}nicht.{0,80}(?:kriterien|anforderungen))|(?:anderen|andere|weitere) (?:kandidat(?::?innen|en)|bewerbungen).{0,180}(?:entschieden|ausgewählt|konzentrieren|berücksichtigen|weiter(?:zu)?machen|besser (?:passen|geeignet)|treffender entsprechen)|other (?:candidates|applicants).{0,140}(?:experience|proceed|selected|closely fit)/i, nextAction: null },
  { type: "offer", confidence: 0.98, pattern: /(?:pleased|delighted|happy) to (?:extend|make) (?:you )?(?:an? )?(?:formal )?(?:job )?offer|offer of employment|we (?:would like|want) to offer you|(?:wir freuen uns,?|wir möchten) (?:ihnen|dir).{0,140}(?:die (?:position|stelle|rolle).{0,80}anzubieten|ein (?:konkretes |formelles )?angebot.{0,80}(?:unterbreiten|machen)|einen arbeitsvertrag.{0,80}(?:anbieten|zusenden))/i, nextAction: "Review the offer and response deadline" },
  { type: "task", confidence: 0.97, pattern: /(?:please|we(?:'d| would) like (?:you )?to|we invite you to).{0,100}(?:complete|prepare|submit).{0,80}(?:case study|take[- ]home|home assignment|design exercise|product exercise)|(?:case study|take[- ]home|home assignment|design exercise|product exercise).{0,120}(?:attached|deadline|due|submit|complete)|(?:bitten|möchten).{0,120}(?:aufgabe|arbeitsprobe).{0,120}(?:bearbeiten|einreichen|senden)|(?:aufgabe|arbeitsprobe).{0,120}(?:frist|deadline|bis zum|einreichen)/i, nextAction: "Complete and submit the assignment" },
  { type: "interview", confidence: 0.97, pattern: /invite you (?:to|for) (?:an? )?interview|schedule (?:an? )?(?:interview|call)|recruiter screen|interview invitation|(?:wir möchten|wir würden|gerne).{0,120}(?:zu einem|zum) (?:vorstellungsgespräch|kennenlerngespräch) (?:einladen|begrüßen)|einladung (?:zum|zu einem) (?:vorstellungsgespräch|kennenlerngespräch)/i, nextAction: "Prepare for the interview and confirm the time" },
  { type: "acknowledgement", confidence: 0.96, pattern: /received your application|application has been received|application was successfully sent|thank you for applying|eingang (?:ihrer|deiner) bewerbung|vielen dank für (?:dein|ihr) interesse und (?:deine|ihre) bewerbung|(?:deine|ihre) bewerbungsunterlagen.{0,140}(?:abgleichen|prüfen|sichten)|bewerbung.{0,120}(?:erhalten|eingegangen|bei uns angekommen|wird (?:nun )?(?:sorgfältig )?geprüft)/i, nextAction: "Wait for the hiring team response" },
  { type: "next_step", confidence: 0.82, pattern: /next step|next stage|move forward|weiteren schritt|nächste runde/i, nextAction: "Review the email and confirm the next step" },
];

const noisePatterns = [
  /(?:new jobs?|job alert|stellenalarm|stellenbenachrichtigung).{0,80}(?:posted|match|recommend|veröffentlicht)/i,
  /(?:companies?|unternehmen).{0,80}(?:are looking for|suchen).{0,40}(?:candidates?|talente).{0,30}(?:like you|wie dich)/i,
  /you(?:'re| are) a great candidate/i,
  /recommended for you|we found (?:these|some) new jobs|new job recommendations|matches your preferences/i,
  /(?:talent community|candidate profile|bewerberprofil).{0,100}(?:created|angelegt|registered|registrierung|welcome|willkommen)/i,
  /(?:profil|profile).{0,80}(?:bestätigen|confirm|vervollständigen|complete)/i,
  /(?:oauth application approval|google.{0,30}account data|newsletter|read this article on linkedin)/i,
  /(?:gehälter|salaries).{0,80}(?:vorstellungsgespräche|interviews).{0,80}(?:zusatzleistungen|benefits)/i,
  /(?:bewerbungsschluss|application deadline).{0,80}(?:top jobs|more jobs|weitere jobs)/i,
  /use your advantage to land your dream job|actively recruiting.{0,100}(?:jobs?|roles?|positions?)/i,
  /(?:jobs?|stellen).{0,50}(?:you may be interested in|that might interest you|für dich|die dich interessieren könnten)/i,
  /(?:top|featured|similar|more|weitere) (?:jobs?|stellenangebote)|see who(?:'s| is) hiring/i,
  /being connected to our company.{0,240}jobs? that suit your profile|durch die connect-option.{0,240}passenden stellen/i,
  /joined the .{0,100}talent community|your job agent .{0,140}matched the following jobs/i,
  /it looks like your background could be a match|please submit a quick application if you have any interest/i,
];

const noiseSubjectPatterns = [
  /^(?:neue|neueste) stellenangebote\b/i,
  /^(?:the )?(?:newest|latest) jobs?\b/i,
  /^jobs? you may be interested in\b/i,
  /\band \d+ other compan(?:y|ies) are looking for candidates like you$/i,
  /\band other great companies are looking for candidates (?:just )?like you!?$/i,
  /^new jobs? posted from /i,
  /^neue bei .+ veröffentlichte stellen$/i,
  /^hi .+es gibt \d+ (?:neue jobs|neuen job) für dich/i,
  /^reminder:\s*submit your application to /i,
  /^(?:your )?application was viewed by /i,
  /^your saved job .+ is still available/i,
  /bewerbung (?:jetzt )?(?:abschließen|nicht vollständig)/i,
  /^(?:welcome to|mit .+ anmelden|passwort erstellen|bestätigung ihrer registrierung)/i,
  /(?:is popular in your network|recently posted|share their thoughts on linkedin|^add .+talent acquisition)/i,
  /(?:third-party oauth application|new or updated grade information|quora digest|google .+account data)/i,
  /(?:time until profile removal|can we keep your information|your .+ dream job is waiting)/i,
];

const explicitApplicationSubjectPatterns = [
  /\b(?:your application was sent|we(?:'ve| have) received your application|application (?:has been )?received|thank you for (?:your application|applying)|thanks for applying)/i,
  /(?:ihre|deine) bewerbung (?:als|für|bei)|bewerbungseingang|eingang (?:ihrer|deiner) bewerbung/i,
];

const conditionalInterviewAcknowledgementPatterns = [
  /(?:plan|expect|hope) to schedule interviews?.{0,240}if you are shortlisted/i,
  /if you are shortlisted.{0,240}(?:arrange|schedule|invite).{0,80}(?:an? )?interview/i,
  /(?:should|if) (?:your application|you) (?:be )?(?:shortlisted|selected).{0,240}(?:interview|call)/i,
];

export function isApplicationNoise(subject: string, sender: string, bodyOrSnippet: string) {
  if (noiseSubjectPatterns.some((pattern) => pattern.test(subject.trim()))) return true;
  if (explicitApplicationSubjectPatterns.some((pattern) => pattern.test(subject.trim()))) return false;
  const text = `${subject}\n${sender}\n${bodyOrSnippet}`.slice(0, 30_000);
  return noisePatterns.some((pattern) => pattern.test(text));
}

export function isTrustedStageClassification(message: {
  classification?: unknown;
  requires_review?: unknown;
  classification_confidence?: unknown;
  match_confidence?: unknown;
}) {
  if (Boolean(message.requires_review) || Number(message.classification_confidence ?? 0) < 0.9) return false;
  return message.classification === "acknowledgement" || Number(message.match_confidence ?? 0) >= 0.9;
}

export function isConfirmedAcknowledgement(message: {
  classification?: unknown;
  confidence?: unknown;
}) {
  return message.classification === "acknowledgement" && Number(message.confidence ?? 0) >= 0.9;
}

export function classifyApplicationEmail(subject: string, body: string): HeuristicClassification {
  if (isApplicationNoise(subject, "", body)) return { classification: "other", confidence: 0.99, nextAction: null };
  const text = `${subject}\n${body}`.slice(0, 30_000);
  if (conditionalInterviewAcknowledgementPatterns.some((pattern) => pattern.test(text))
    && /received your application|thank you for applying|thank you for your application/i.test(text)) {
    return { classification: "acknowledgement", confidence: 0.98, nextAction: "Wait for the hiring team response" };
  }
  const found = patterns.find((item) => item.pattern.test(text));
  return found ? { classification: found.type, confidence: found.confidence, nextAction: found.nextAction } : { classification: "other", confidence: 0.25, nextAction: null };
}

export function isLikelyApplicationEmail(subject: string, sender: string, snippet: string) {
  const text = `${subject} ${sender} ${snippet}`;
  if (isApplicationNoise(subject, sender, snippet)) return false;
  return /your application|application (?:received|update|status|for)|thank you for applying|thanks for applying|bewerbung(?:seingang|sstatus)?|ihre bewerbung|deine bewerbung|interview invitation|invite you to interview|vorstellungsgespräch|kennenlerngespräch|case study|take[- ]home assignment|job offer|offer of employment|absage|greenhouse|lever|ashby|workable|personio|smartrecruiters|teamtailor|onlyfy|talentlyft/i.test(text);
}

const rank: Record<ApplicationStage, number> = {
  needs_match: 0,
  applied: 1,
  interview: 2,
  task: 3,
  offer: 4,
  rejected: -1,
  archived: -2,
};

export function classificationToStage(classification: ApplicationMessage["classification"]): ApplicationStage | null {
  if (classification === "acknowledgement") return "applied";
  if (classification === "interview") return "interview";
  if (classification === "task") return "task";
  if (classification === "offer") return "offer";
  if (classification === "rejection") return "rejected";
  return null;
}

export function shouldAdvanceStage(current: ApplicationStage, next: ApplicationStage, incomingAt: string, latestMessageAt?: string | null) {
  if (latestMessageAt && new Date(incomingAt).getTime() < new Date(latestMessageAt).getTime()) return false;
  if (next === "rejected") return current !== "offer";
  if (current === "rejected" && rank[next] >= rank.interview) return true;
  return rank[next] >= rank[current];
}
