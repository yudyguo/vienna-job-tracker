import { describe, expect, it } from "vitest";
import { classificationToStage, classifyApplicationEmail, isConfirmedAcknowledgement, isLikelyApplicationEmail, isTrustedStageClassification, shouldAdvanceStage } from "@/lib/email/classifier";

describe("application email classification", () => {
  it.each([
    ["Thank you for applying", "We received your application", "acknowledgement", "applied"],
    ["Interview invitation", "We would like to schedule an interview", "interview", "interview"],
    ["Case study", "Please complete this take-home assignment", "task", "task"],
    ["Offer", "We are pleased to extend a job offer", "offer", "offer"],
    ["Application update", "We will not be moving forward", "rejection", "rejected"],
  ])("classifies %s", (subject, body, classification, stage) => {
    const result = classifyApplicationEmail(subject, body);
    expect(result.classification).toBe(classification);
    expect(result.confidence).toBeGreaterThanOrEqual(0.9);
    expect(classificationToStage(result.classification)).toBe(stage);
  });

  it("does not downgrade a later-stage application with an acknowledgement", () => {
    expect(shouldAdvanceStage("interview", "applied", "2026-08-11T08:00:00Z", "2026-08-10T08:00:00Z")).toBe(false);
  });

  it("treats a conditional future interview as an acknowledgement", () => {
    expect(classifyApplicationEmail(
      "Thank you for your application at George Labs!",
      "Thank you for applying. We plan to schedule interviews within the next two weeks. If you are shortlisted, a recruiter will contact you to arrange an interview.",
    )).toMatchObject({ classification: "acknowledgement", confidence: 0.98 });
  });

  it("ignores older out-of-order status mail", () => {
    expect(shouldAdvanceStage("applied", "interview", "2026-08-09T08:00:00Z", "2026-08-10T08:00:00Z")).toBe(false);
  });

  it.each([
    ["Dein Bewerberprofil bei Sonepar", "Dein Bewerberprofil wurde erfolgreich angelegt. Benachrichtigungen über neue Stellenangebote.", "correspondencesonepar@successfactors.eu"],
    ["You're a great candidate: Marketing Automation Manager", "Recommended for you. Here are new jobs that match your search.", "info@jobagent.stepstone.at"],
    ["supseven e.U.: Was du wissen solltest", "Gehälter, Vorstellungsgespräche und Zusatzleistungen. Bereite dich gut vor.", "noreply@glassdoor.com"],
    ["Use your advantage to land your dream job", "See who is actively recruiting. Jobs you may be interested in.", "info@stepstone.at"],
    ["Jobs you may be interested in", "Similar jobs posted this week. See who's hiring.", "jobs-noreply@linkedin.com"],
    ["XXXLdigital - Part of XXXL Group and 9 other companies are looking for candidates like you", "Check out your latest matches. We found these new jobs that match your search for Product Manager OR Product Owner, Wien.", "info@jobagent.stepstone.at"],
    ["New jobs posted from careers.agfa.com", "Your Job Agent matched the following jobs at careers.agfa.com.", "agfagevaertnv@noreply12.jobs2web.com"],
    ["Reminder: Submit your application to kununu", "Continue your application for this vacancy.", "jobs@mail.xing.com"],
    ["Your application was viewed by Vizrt", "The employer viewed your application.", "jobs-noreply@linkedin.com"],
    ["Hi Yudy 💁 Es gibt 4 neue Jobs für dich!", "Schau dir deine neuen Jobvorschläge an.", "julia@jobs.at"],
  ])("does not turn career marketing into an application: %s", (subject, body, sender) => {
    expect(classifyApplicationEmail(subject, body)).toMatchObject({ classification: "other", confidence: 0.99 });
    expect(isLikelyApplicationEmail(subject, sender, body)).toBe(false);
  });

  it("does not interpret a generic mention of Stellenangebote as an offer", () => {
    expect(classifyApplicationEmail("Profil erstellt", "Du kannst Benachrichtigungen über neue Stellenangebote verwalten.").classification).toBe("other");
  });

  it.each([
    ["Adecco - Vielen Dank für Ihre Bewerbung", "Nach sorgfältiger Prüfung müssen wir Ihnen leider mitteilen, dass Ihr Profil nicht alle Kriterien erfüllt. Gerne halten wir Ihre Unterlagen für zukünftige Stellenangebote in Evidenz."],
    ["Your application", "Unfortunately your candidacy has not been selected for further consideration. We decided to proceed with other applicants."],
    ["Ihr Interesse an einer Zusammenarbeit", "Obwohl wir einen positiven Eindruck hatten, müssen wir Ihnen leider mitteilen, dass wir uns auf andere Kandidat:innen konzentrieren werden."],
    ["Application update", "We regret that your qualifications do not entirely match the requirements for the vacant position."],
    ["Ihre Bewerbung bei TechTalk", "Daher bedauern wir sehr, Ihnen heute absagen zu müssen. Wir haben andere Kandidat:innen, deren Voraussetzungen und Erfahrungen für die Position besser passen."],
    ["Ihr Bewerbungsprozess für die Stelle als Digital Experience Designer (m/w/d)", "Wir bedanken uns für Ihre Bewerbung. Leider müssen wir Ihnen mitteilen, dass wir Sie bei dieser Position nicht in die weitere Auswahl mitaufgenommen haben, da weitere Bewerbungen unserem Qualifikationsprofil treffender entsprechen."],
  ])("treats a rejection containing future job offers as rejection: %s", (subject, body) => {
    expect(classifyApplicationEmail(subject, body)).toMatchObject({ classification: "rejection", confidence: 0.98 });
  });

  it("recognizes a German acknowledgement without mistaking related jobs for an offer", () => {
    expect(classifyApplicationEmail(
      "Vielen Dank für die Zusendung Ihrer Bewerbung",
      "Ihre Bewerbung ist bei uns eingegangen und wird nun sorgfältig geprüft. Später können Sie ähnliche Stellenangebote ansehen.",
    )).toMatchObject({ classification: "acknowledgement", confidence: 0.96 });
  });

  it("recognizes the Raiffeisen Digital receipt as an acknowledgement rather than a task", () => {
    expect(classifyApplicationEmail(
      "Deine Bewerbung als Conversational KI Designer (d/m/w)",
      "Vielen Dank für dein Interesse und deine Bewerbung. Wir werden deine Bewerbungsunterlagen mit unserem Anforderungsprofil abgleichen. Bitte gib uns dafür ein paar Tage Zeit.",
    )).toMatchObject({ classification: "acknowledgement", confidence: 0.96 });
  });

  it("does not let recommendation links in a footer hide a real application receipt", () => {
    expect(classifyApplicationEmail(
      "Yadi, your application was sent to Zettabyte",
      "Your application was successfully sent. Recommended for you: similar jobs.",
    )).toMatchObject({ classification: "acknowledgement" });
  });

  it.each([
    ["Deine Bewerbung @ nexxar GmbH", "Wir müssen dir leider mitteilen, dass wir dich im aktuellen Prozess nicht weiter berücksichtigen können."],
    ["ETERNO – Deine Bewerbung", "Wir haben beschlossen, mit Kandidat:innen weiterzumachen, die besser entsprechen. Deine Bewerbung werden wir nicht weiterverfolgen."],
    ["Update about your application", "Unfortunately I decided to offer another candidate the position."],
  ])("recognizes additional explicit rejection language: %s", (subject, body) => {
    expect(classifyApplicationEmail(subject, body)).toMatchObject({ classification: "rejection", confidence: 0.98 });
  });

  it("requires direct language for a real German offer", () => {
    expect(classifyApplicationEmail("Unser Angebot", "Wir freuen uns, Ihnen die Position als Product Designer anzubieten."))
      .toMatchObject({ classification: "offer", confidence: 0.98 });
  });

  it("does not let an unconfirmed message override the stored application stage", () => {
    expect(isTrustedStageClassification({ requires_review: true, classification_confidence: 0.98, match_confidence: 0.95 })).toBe(false);
    expect(isTrustedStageClassification({ requires_review: false, classification_confidence: 0.98, match_confidence: 0.95 })).toBe(true);
  });

  it("trusts a confirmed application receipt even before the exact job is matched", () => {
    expect(isConfirmedAcknowledgement({ classification: "acknowledgement", confidence: 0.96 })).toBe(true);
    expect(isTrustedStageClassification({ classification: "acknowledgement", requires_review: false, classification_confidence: 0.96, match_confidence: 0 })).toBe(true);
  });

  it("does not auto-advance a low-confidence receipt or another unmatched stage", () => {
    expect(isConfirmedAcknowledgement({ classification: "acknowledgement", confidence: 0.89 })).toBe(false);
    expect(isTrustedStageClassification({ classification: "interview", requires_review: false, classification_confidence: 0.97, match_confidence: 0 })).toBe(false);
  });
});
