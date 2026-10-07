import { describe, expect, it } from "vitest";
import { selectExistingJobMatch, selectPlaceholderCompanyMatch } from "@/lib/applications/job-match";
import { classifyJobInboxKind } from "@/lib/jobs/inbox";

const jobs = [
  { id: "harman", title: "UI/UX Designer (m/f/d)", company: "HARMAN International GmbH", source: "gmail_alert", publishedAt: "2026-08-01T08:00:00Z" },
  { id: "qualysoft", title: "Product Designer", company: "Qualysoft GmbH", source: "manual", publishedAt: "2026-08-01T08:00:00Z" },
  { id: "mail", title: "待认领的申请职位", company: "StepStone", source: "gmail_application" },
];

describe("application email job matching", () => {
  it("matches an acknowledgement to the real job using normalized title and company", () => {
    expect(selectExistingJobMatch({ title: "UI/UX Designer", company: "HARMAN International", receivedAt: "2026-08-11T08:00:00Z", jobs }))
      .toMatchObject({ jobId: "harman", confidence: 0.99 });
  });

  it("never treats an email placeholder as the destination job", () => {
    expect(selectExistingJobMatch({ title: "待认领的申请职位", company: "StepStone", jobs })).toBeNull();
    expect(selectExistingJobMatch({ title: "职位名称待补充", company: "StepStone", jobs })).toBeNull();
  });

  it("ignores an ATS platform name as the employer", () => {
    expect(selectExistingJobMatch({ title: null, company: "ashbyhq", jobs })).toBeNull();
  });

  it("uses a unique, recent company match when the email title is generic", () => {
    expect(selectExistingJobMatch({ title: "a position", company: "Qualysoft", receivedAt: "2026-08-11T08:00:00Z", jobs }))
      .toMatchObject({ jobId: "qualysoft", confidence: 0.92, reason: "company" });
  });

  it("refuses an ambiguous company-only match", () => {
    const ambiguous = [...jobs, { id: "qualysoft-2", title: "UX Researcher", company: "Qualysoft", source: "manual", publishedAt: "2025-01-02T08:00:00Z" }];
    expect(selectExistingJobMatch({ company: "Qualysoft", receivedAt: "2026-08-11T08:00:00Z", jobs: ambiguous })).toBeNull();
  });

  it("never merges a same-title email when the employer is different", () => {
    expect(selectExistingJobMatch({ title: "Product Designer", company: "Eversports", receivedAt: "2026-08-17T13:34:03Z", jobs }))
      .toBeNull();
  });

  it("only uses title-only matching for one existing application", () => {
    const appliedJobs = jobs.map((job) => job.id === "qualysoft" ? { ...job, hasApplication: true } : job);
    expect(selectExistingJobMatch({ title: "Product Designer", company: null, jobs: appliedJobs }))
      .toMatchObject({ jobId: "qualysoft", confidence: 0.91, reason: "title" });
  });

  it("merges a title-less follow-up into one recent placeholder from the same company domain", () => {
    expect(selectPlaceholderCompanyMatch({
      title: null,
      company: "TechTalk GmbH",
      senderEmail: "magdalena.glatzl@techtalk.at",
      receivedAt: "2026-08-17T14:49:29Z",
      jobs: [{
        id: "techtalk",
        title: "待认领的申请职位",
        company: "TechTalk GmbH",
        source: "gmail_application",
        applicationMessages: [{ senderEmail: "jobs@techtalk.at", receivedAt: "2026-08-06T14:03:27Z" }],
      }],
    })).toMatchObject({ jobId: "techtalk", confidence: 0.96, reason: "company" });
  });

  it("merges a title-bearing follow-up into one recent title-less company flow", () => {
    expect(selectPlaceholderCompanyMatch({
      title: "Digital Experience Designer",
      company: "ELK",
      senderEmail: "bewerbung@elk.at",
      receivedAt: "2026-08-13T06:48:49Z",
      jobs: [{
        id: "elk-application",
        title: "职位名称待补充",
        company: "ELK",
        source: "gmail_application",
        applicationMessages: [{ senderEmail: "bewerbung@elk.at", receivedAt: "2026-08-01T08:00:00Z" }],
      }],
    })).toMatchObject({ jobId: "elk-application", confidence: 0.96, reason: "company" });
  });

  it("refuses a title-less placeholder merge across sender domains or ambiguous applications", () => {
    const base = {
      title: null,
      company: "TechTalk GmbH",
      receivedAt: "2026-08-17T14:49:29Z",
    };
    const candidate = {
      id: "techtalk",
      title: "待认领的申请职位",
      company: "TechTalk GmbH",
      source: "gmail_application",
      applicationMessages: [{ senderEmail: "jobs@techtalk.at", receivedAt: "2026-08-06T14:03:27Z" }],
    };
    expect(selectPlaceholderCompanyMatch({ ...base, senderEmail: "reply@other.example", jobs: [candidate] })).toBeNull();
    expect(selectPlaceholderCompanyMatch({ ...base, senderEmail: "hr@techtalk.at", jobs: [candidate, { ...candidate, id: "techtalk-2" }] })).toBeNull();
  });
});

describe("job inbox attention level", () => {
  it("hides acknowledgement-only Gmail records", () => {
    expect(classifyJobInboxKind("gmail_application", ["acknowledgement", "other"])).toBe("mail_low_signal");
  });

  it("keeps actionable Gmail records visible", () => {
    expect(classifyJobInboxKind("gmail_application", ["acknowledgement", "interview"])).toBe("mail_actionable");
  });

  it("keeps low-confidence classifications out of the opportunity inbox", () => {
    expect(classifyJobInboxKind("gmail_application", ["task"], true)).toBe("mail_low_signal");
  });

  it("groups Gmail job alerts as recommendations", () => {
    expect(classifyJobInboxKind("gmail_job_alert", [])).toBe("recommendation");
  });
});
