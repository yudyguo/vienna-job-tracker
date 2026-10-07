import { describe, expect, it } from "vitest";
import { inferMessageProcessStep } from "@/lib/applications/process-steps";

function message(subject: string, classification: "interview" | "acknowledgement" | "task" | "offer" | "rejection" = "interview") {
  return {
    subject,
    classification,
    bodyText: "",
    receivedAt: "2026-08-11T08:00:00Z",
    nextAction: null,
    nextActionAt: "2026-08-15T09:00:00Z",
  } as const;
}

describe("application process steps", () => {
  it.each([
    ["1st Round Interview", "interview", 1],
    ["Second interview with the product team", "interview", 2],
    ["Einladung zur dritten Runde", "interview", 3],
    ["Final interview", "final_interview", null],
    ["Einladung zum telefonischen Erstgespräch", "screening", 1],
  ])("extracts process stage from %s", (subject, kind, roundNumber) => {
    expect(inferMessageProcessStep(message(subject))).toMatchObject({ kind, roundNumber });
  });

  it.each([
    ["Application received", "acknowledgement", "applied"],
    ["Case study", "task", "task"],
    ["Offer", "offer", "offer"],
    ["Application update", "rejection", "rejection"],
  ])("maps %s to %s", (subject, classification, kind) => {
    expect(inferMessageProcessStep(message(subject, classification as Parameters<typeof message>[1])).kind).toBe(kind);
  });
});
