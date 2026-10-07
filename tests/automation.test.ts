import { describe, expect, it } from "vitest";
import { selectAutomaticGenerationQueue } from "@/lib/generation-policy";
import { viennaClock } from "@/lib/time";

describe("Vienna scheduling", () => {
  it("maps winter UTC to Vienna 07:30", () => {
    expect(viennaClock(new Date("2026-01-15T06:30:00Z"))).toMatchObject({ hour: 7, minute: 30, localDate: "2026-01-15" });
  });

  it("maps summer UTC to Vienna 07:30", () => {
    expect(viennaClock(new Date("2026-08-09T05:30:00Z"))).toMatchObject({ hour: 7, minute: 30, localDate: "2026-08-09" });
  });

  it("limits automatic material generation to the top three eligible roles", () => {
    const jobs = [88, 95, 91, 89, 79].map((score, index) => ({ id: String(index), score, blockers: [] }));
    expect(selectAutomaticGenerationQueue(jobs).map((job) => job.score)).toEqual([95, 91, 89]);
  });
});
