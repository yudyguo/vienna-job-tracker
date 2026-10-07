import { describe, expect, it } from "vitest";
import { isCssContaminated, parseAlertIdentity, parseAlertJobSummary, parseGmailPayload } from "@/lib/email/parser";

function encoded(value: string) {
  return Buffer.from(value).toString("base64url");
}

describe("Gmail MIME parser", () => {
  it("prefers text/plain within multipart alternative", () => {
    const parsed = parseGmailPayload({ mimeType: "multipart/alternative", parts: [
      { mimeType: "text/html", body: { data: encoded("<style>.x{color:red}</style><p>HTML copy</p>") } },
      { mimeType: "text/plain", body: { data: encoded("Plain application update") } },
    ] });
    expect(parsed.usedMimeType).toBe("text/plain");
    expect(parsed.text).toBe("Plain application update");
  });

  it("removes CSS, scripts and tracking parameters from HTML-only mail", () => {
    const parsed = parseGmailPayload({ mimeType: "text/html", body: { data: encoded(`
      <html><head><style>.card { display:flex; font-family:Arial }</style><script>alert(1)</script></head>
      <body><div>Interview invitation</div><a href="https://example.com/job/42?utm_source=mail&trk=abc">Role</a><div>Unsubscribe</div><div>Premium promo</div></body></html>
    `) } });
    expect(parsed.text).toContain("Interview invitation");
    expect(parsed.text).not.toMatch(/display:flex|font-family|alert\(1\)/);
    expect(parsed.links[0]).toBe("https://example.com/job/42");
    expect(isCssContaminated(parsed.text)).toBe(false);
  });

  it("content-sniffs HTML that was mislabeled as text/plain", () => {
    const parsed = parseGmailPayload({ mimeType: "text/plain", body: { data: encoded(`<!doctype html><html><head><style>.hidden{display:none;font-family:Arial}</style></head><body><p>Application received</p></body></html>`) } });
    expect(parsed.text).toBe("Application received");
    expect(parsed.text).not.toMatch(/<style|font-family|display:none/);
  });

  it("extracts the primary LinkedIn subject identity without using other digest cards", () => {
    expect(parseAlertIdentity("User Experience Designer at Infinity Quest", "LinkedIn Job Alerts", "User Experience Designer\nInfinity Quest\nEuropean Union Remote\nOther jobs\nBerlin")).toEqual({
      title: "User Experience Designer",
      company: "Infinity Quest",
      location: "European Union Remote",
    });
  });

  it("keeps only the first LinkedIn digest card and canonicalizes its URL", () => {
    const body = `Jobs similar to Freelance Product Designer at Example https://www.linkedin.com/comm/jobs/view/123/
A new job matches your preferences.

Design Engineer - B2B SAAS - REMOTE
chatarmin.com
Austria
5 school alumni
This company is actively hiring
Apply with resume & profile
View job: https://www.linkedin.com/comm/jobs/view/4445879441/?trackingId=secret&otpToken=secret

---------------------------------------------------------
AI Platform Designer (all humans)
Erste Digital
Vienna, Austria
View job: https://www.linkedin.com/comm/jobs/view/4448177573/?trackingId=other

See all jobs on LinkedIn: https://www.linkedin.com/comm/jobs/search-results/?keywords=design`;
    const parsed = parseAlertJobSummary("Design Engineer at chatarmin.com: up to €150K/year", "Job Recommendations jobs-noreply@linkedin.com", body, [
      "https://www.linkedin.com/comm/jobs/view/4445879441/?trackingId=secret&otpToken=secret",
      "https://www.linkedin.com/comm/jobs/view/4448177573/?trackingId=other",
    ]);
    expect(parsed).toMatchObject({
      title: "Design Engineer - B2B SAAS - REMOTE",
      company: "chatarmin.com",
      location: "Austria",
      sourceUrl: "https://www.linkedin.com/jobs/view/4445879441/",
    });
    expect(parsed.summaryText).not.toContain("Erste Digital");
    expect(parsed.summaryText).not.toContain("trackingId");
  });
});
