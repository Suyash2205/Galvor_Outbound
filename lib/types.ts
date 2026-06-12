export type LeadStage = "1" | "2" | "3" | "4" | "5" | "6" | "Response Received";

export type LeadStatus =
  | "ready"
  | "generating"
  | "sending"
  | "sent"
  | "error"
  | "responded";

export interface AdCluster {
  name: string;
  description: string;
  adCount: number;
  avgAgeDays: number;
  oldestDays: number;
}

export interface ClaudeAnalysis {
  clusters: AdCluster[];
  insight: string;
  followUpBody: string;
}

export interface Lead {
  rowIndex: number;
  leadId: string;
  email: string;
  firstName: string;
  lastName: string;
  companyName: string;
  industry: string;
  metaAdLibraryUrl: string;
  closingCopy: string;
  stage: LeadStage;
  status: LeadStatus;
  email1SentAt: string;
  email2SentAt: string;
  email3SentAt: string;
  email4SentAt: string;
  email5SentAt: string;
  email6SentAt: string;
  gmailThreadId: string;
  lastGmailMessageId: string;
  respondedAt: string;
  assignedTo: string;
  notes: string;
  errorMessage: string;
  cachedAnalysis: ClaudeAnalysis | null;
}

export interface EmailContent {
  subject: string;
  htmlBody: string;
  plainBody: string;
}

export const SHEET_TAB_NAME = "Outbound Pipeline";

export const SHEET_HEADERS = [
  "lead_id",
  "email",
  "first_name",
  "last_name",
  "company_name",
  "industry",
  "meta_ad_library_url",
  "closing_copy",
  "stage",
  "status",
  "email_1_sent_at",
  "email_2_sent_at",
  "email_3_sent_at",
  "email_4_sent_at",
  "email_5_sent_at",
  "email_6_sent_at",
  "gmail_thread_id",
  "last_gmail_message_id",
  "responded_at",
  "assigned_to",
  "notes",
  "error_message",
  "cached_analysis",
] as const;

export const STAGE_TABS = [
  { id: "1", label: "Email 1" },
  { id: "2", label: "Email 2" },
  { id: "3", label: "Email 3" },
  { id: "4", label: "Email 4" },
  { id: "5", label: "Email 5" },
  { id: "6", label: "Email 6" },
  { id: "Response Received", label: "Responses" },
] as const;

export const DEFAULT_CLOSING_COPY =
  "A brand we work with moved into that format first — 4.84× RoAS vs. a 2.49× baseline. +67% overall.\n\n30 minutes. Your competitor map. One creative cluster your team isn't running yet.";
