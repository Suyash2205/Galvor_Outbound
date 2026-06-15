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
export const SHEET_TAB_GID = "395826309";

/** CRM source tab (gid 938325154) — Contacts CRM - India */
export const CRM_SOURCE_TAB_NAME = "Contacts CRM - India";
export const CRM_SOURCE_TAB_GID = "938325154";

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

/** Outreach tracker spreadsheet (separate from Outbound Pipeline) */
export const OUTREACH_TRACKER_SPREADSHEET_ID =
  "13rGwhOjtNfYhjWDMZkIE_Iq3c6cY237g9JCKYYBGCl0";

/** Brand-level tracker tab (gid 1535921837) — row 3 = headers, data from row 4 */
export const BRAND_TRACKER_TAB_NAME = "Tracker";
export const BRAND_TRACKER_TAB_GID = "1535921837";

/** Legacy name — contacts may live on Tracker or New Contacts */
export const OUTREACH_TRACKER_TAB_NAME = "Tracker";

export const OUTREACH_ACTIVITY_TAB_NAME = "Activity Log";

export const OUTREACH_ACTIVITY_HEADERS = [
  "logged_at",
  "activity_date",
  "brand",
  "category",
  "comments",
  "polished_comment",
  "logged_by",
] as const;

export const OUTREACH_CATEGORIES = [
  "Contracting",
  "Demo",
  "Call",
  "New account",
  "Follow-up",
] as const;

export type OutreachCategory = (typeof OUTREACH_CATEGORIES)[number];

export interface OutreachActivity {
  rowIndex: number;
  loggedAt: string;
  activityDate: string;
  brand: string;
  category: OutreachCategory;
  comments: string;
  polishedComment: string;
  loggedBy: string;
}

export interface OutreachBrand {
  name: string;
  rowCount: number;
}

export interface PipelineSyncResult {
  updated: number;
  skipped: number;
  unmatched: string[];
  matchedByEmail: number;
  matchedByCompany: number;
}

export type BrandTrackerStatusCategory =
  | "active"
  | "response_no_work"
  | "email_only"
  | "other"
  | "empty";

export interface BrandTrackerView {
  brand: string;
  industry: string;
  finalStatus: string;
  comments: string;
  lastActivityDate: string;
  rowIndices: number[];
  hasActivityLog: boolean;
  statusCategory: BrandTrackerStatusCategory;
}

export interface BrandTrackerSyncResult {
  updated: number;
  brands: number;
  activeLeads: number;
  emailOnly: number;
  responseNoWork: number;
}
