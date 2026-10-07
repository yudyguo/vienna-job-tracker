import type { ApplicationMessage, Job } from "@/lib/types";

const actionableClassifications = new Set<ApplicationMessage["classification"]>([
  "interview", "task", "offer", "rejection", "next_step",
]);

export function classifyJobInboxKind(
  source: string,
  classifications: ApplicationMessage["classification"][],
  requiresReview = false,
): NonNullable<Job["inboxKind"]> {
  if (source === "gmail_job_alert") return "recommendation";
  if (source !== "gmail_application") return "opportunity";
  // Low-confidence classifications belong on the application review board, not in
  // the default opportunity inbox. They remain available behind "显示邮件记录".
  if (requiresReview) return "mail_low_signal";
  return classifications.some((classification) => actionableClassifications.has(classification))
    ? "mail_actionable"
    : "mail_low_signal";
}
