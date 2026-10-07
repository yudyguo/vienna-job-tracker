export type RoleTrack = "design" | "product";

export type JobStatus =
  | "new"
  | "shortlisted"
  | "materials_ready"
  | "reviewed"
  | "applied"
  | "interview"
  | "task"
  | "offer"
  | "rejected"
  | "archived";

export type ApplicationStage =
  | "needs_match"
  | "applied"
  | "interview"
  | "task"
  | "offer"
  | "rejected"
  | "archived";

export type MaterialKind = "resume_ats" | "resume_hallmark" | "cover_letter";
export type MaterialFormat = "json" | "typ" | "pdf" | "docx";
export type ListingStatus = "unknown" | "active" | "closed";
export type JdQuality = "full" | "summary" | "missing";
export type ApplicationProcessKind = "applied" | "screening" | "interview" | "final_interview" | "task" | "offer" | "rejection" | "status_change" | "other";

export interface CandidateFact {
  id: string;
  category: "experience" | "skill" | "education" | "language" | "award" | "project";
  label: string;
  value: string;
  evidence: string;
  verified: boolean;
  source: string;
}

export interface Job {
  id: string;
  company: string;
  title: string;
  track: RoleTrack;
  location: string;
  remotePolicy: string;
  score: number;
  scoringStatus: "queued" | "scoring" | "completed" | "failed";
  scoringError?: string | null;
  listingStatus: ListingStatus;
  listingStatusSource?: string | null;
  listingCheckedAt?: string | null;
  listingClosedAt?: string | null;
  status: JobStatus;
  languageRequirement: string;
  salaryMin?: number | null;
  salaryMax?: number | null;
  currency?: string | null;
  tags: string[];
  source: string;
  sourceUrl?: string | null;
  publishedAt: string;
  capturedAt: string;
  summary: string;
  matchReasons: string[];
  blockers: string[];
  jdText?: string;
  jdQuality: JdQuality;
  parserVersion?: string | null;
  applicationStage?: ApplicationStage | null;
  applicationNextAction?: string | null;
  applicationNextActionAt?: string | null;
  applicationLatestMessageAt?: string | null;
  applicationRequiresReview?: boolean;
  inboxKind?: "opportunity" | "recommendation" | "mail_low_signal" | "mail_actionable";
  isDemo?: boolean;
}

export interface MaterialVersion {
  id: string;
  materialId: string;
  version: number;
  jobId: string;
  jobTitle: string;
  company: string;
  kind: MaterialKind;
  language: "en" | "de";
  format: MaterialFormat;
  status: "draft" | "reviewed" | "approved" | "compile_pending" | "failed";
  storagePath?: string | null;
  createdAt: string;
  model?: string | null;
  factIds: string[];
}

export interface MaterialVariant {
  id: string;
  materialId: string;
  language: MaterialVersion["language"];
  version: number;
  status: MaterialVersion["status"];
  createdAt: string;
  model?: string | null;
  factIds: string[];
  files: MaterialVersion[];
}

export interface MaterialRecord {
  id: string;
  jobId: string;
  jobTitle: string;
  company: string;
  kind: MaterialKind;
  latestCreatedAt: string;
  variants: MaterialVariant[];
}

export interface Application {
  id: string;
  jobId: string;
  company: string;
  title: string;
  status: ApplicationStage;
  appliedAt?: string | null;
  nextAction?: string | null;
  nextActionAt?: string | null;
  latestMessageAt?: string | null;
  latestMessageType?: ApplicationMessage["classification"] | null;
  stageSource: string;
  classificationConfidence?: number | null;
  matchConfidence?: number | null;
  priorityAt?: string | null;
  requiresReview: boolean;
  jdQuality: JdQuality;
  updatedAt: string;
  relatedApplicationIds?: string[];
  relatedJobIds?: string[];
  relatedMessageIds?: string[];
  logicalId?: string;
}

export interface ApplicationMessage {
  id: string;
  applicationId: string;
  gmailUrl: string;
  subject: string;
  senderName?: string | null;
  senderEmail?: string | null;
  receivedAt: string;
  bodyText: string;
  classification: "acknowledgement" | "interview" | "task" | "offer" | "rejection" | "next_step" | "other";
  classificationConfidence: number;
  extractedCompany?: string | null;
  extractedTitle?: string | null;
  nextAction?: string | null;
  nextActionAt?: string | null;
  matchConfidence?: number | null;
  requiresReview: boolean;
}

export interface ApplicationProcessStep {
  id: string;
  applicationId: string;
  messageId?: string | null;
  eventId?: string | null;
  kind: ApplicationProcessKind;
  roundNumber?: number | null;
  title: string;
  occurredAt: string;
  scheduledAt?: string | null;
  source: string;
  notes?: string | null;
  metadata: Record<string, unknown>;
}

export interface PreparationPackVersion {
  id: string;
  applicationId: string;
  kind: "interview" | "task" | "offer" | "general";
  version: number;
  status: "draft" | "needs_jd" | "failed";
  content: PreparationPackContent;
  factIds: string[];
  createdAt: string;
}

export interface PreparationPackContent {
  summary: string;
  logistics: string[];
  assessmentAreas: string[];
  starStories: Array<{ title: string; outline: string; factIds: string[] }>;
  likelyQuestions: string[];
  questionsToAsk: string[];
  risks: string[];
  checklist: string[];
}

export interface JobDossier {
  job: Job;
  application: Application | null;
  messages: ApplicationMessage[];
  preparationPacks: PreparationPackVersion[];
  processSteps: ApplicationProcessStep[];
  materialCount: number;
}

export interface AutomationRun {
  id: string;
  localDate: string;
  trigger: "scheduled" | "manual";
  status: "queued" | "running" | "completed" | "partial" | "failed" | "skipped";
  discovered: number;
  deduplicated: number;
  highScore: number;
  generated: number;
  error?: string | null;
  startedAt: string;
  completedAt?: string | null;
}

export interface MailSyncRun {
  id: string;
  trigger: "scheduled" | "manual" | "backfill" | "rebuild";
  status: "queued" | "running" | "completed" | "partial" | "failed" | "skipped";
  scanned: number;
  candidates: number;
  imported: number;
  updatedApplications: number;
  needsReview: number;
  error?: string | null;
  startedAt: string;
  completedAt?: string | null;
}

export interface GmailConnectionHealth {
  status: "not_connected" | "active" | "reauthorization_required";
  accountEmail?: string | null;
  connectedAt?: string | null;
  lastErrorAt?: string | null;
}

export interface GeneratedResumeContent {
  headline: string;
  summary: string;
  experience: Array<{
    company: string;
    role: string;
    period: string;
    factIds: string[];
    bullets: Array<{ text: string; factIds: string[] }>;
  }>;
  skills: Array<{ text: string; factIds: string[] }>;
  education: Array<{ text: string; factIds: string[] }>;
  factIds: string[];
}

export interface GeneratedCoverLetterContent {
  language: "en" | "de";
  subject: string;
  greeting: string;
  paragraphs: Array<{ text: string; factIds: string[] }>;
  closing: string;
  factIds: string[];
}

export interface MaterialBundleContent {
  resume: GeneratedResumeContent;
  coverLetter: GeneratedCoverLetterContent;
  englishReviewCopy?: GeneratedCoverLetterContent;
}
