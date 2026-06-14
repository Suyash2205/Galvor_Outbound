import { google } from "googleapis";
import {
  SHEET_HEADERS,
  SHEET_TAB_NAME,
  SHEET_TAB_GID,
  type ClaudeAnalysis,
  type Lead,
  type LeadStage,
  type LeadStatus,
} from "./types";

const LEADS_CACHE_MS = 45_000;
const ROW_CACHE_MS = 30_000;

let leadsCache: { data: Lead[]; at: number } | null = null;
const rowCache = new Map<number, { lead: Lead; at: number }>();

function getAuth() {
  const email = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
  const key = process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY?.replace(/\\n/g, "\n");
  if (!email || !key) {
    throw new Error(
      "GOOGLE_SERVICE_ACCOUNT_EMAIL and GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY must be set."
    );
  }
  return new google.auth.JWT({
    email,
    key,
    scopes: ["https://www.googleapis.com/auth/spreadsheets"],
  });
}

function getSpreadsheetId() {
  const id = process.env.GOOGLE_SHEETS_SPREADSHEET_ID;
  if (!id) throw new Error("GOOGLE_SHEETS_SPREADSHEET_ID is not configured.");
  return id;
}

export function invalidateLeadsCache() {
  leadsCache = null;
  rowCache.clear();
}

function patchRowCache(rowIndex: number, lead: Lead) {
  rowCache.set(rowIndex, { lead, at: Date.now() });
}

function parseAnalysis(raw: string): ClaudeAnalysis | null {
  if (!raw?.trim()) return null;
  try {
    return JSON.parse(raw) as ClaudeAnalysis;
  } catch {
    return null;
  }
}

export function rowToLead(row: string[], rowIndex: number): Lead | null {
  if (!row[0]?.trim() && !row[1]?.trim() && !row[4]?.trim()) return null;

  const stage = (row[8]?.trim() || "1") as LeadStage;
  const validStages: LeadStage[] = ["1", "2", "3", "4", "5", "6", "Response Received"];
  const normalizedStage = validStages.includes(stage) ? stage : "1";

  return {
    rowIndex,
    leadId: row[0]?.trim() || `row-${rowIndex}`,
    email: row[1]?.trim() || "",
    firstName: row[2]?.trim() || "",
    lastName: row[3]?.trim() || "",
    companyName: row[4]?.trim() || "",
    industry: row[5]?.trim() || "",
    metaAdLibraryUrl: row[6]?.trim() || "",
    closingCopy: row[7]?.trim() || "",
    stage: normalizedStage,
    status: (row[9]?.trim() || "ready") as LeadStatus,
    email1SentAt: row[10]?.trim() || "",
    email2SentAt: row[11]?.trim() || "",
    email3SentAt: row[12]?.trim() || "",
    email4SentAt: row[13]?.trim() || "",
    email5SentAt: row[14]?.trim() || "",
    email6SentAt: row[15]?.trim() || "",
    gmailThreadId: row[16]?.trim() || "",
    lastGmailMessageId: row[17]?.trim() || "",
    respondedAt: row[18]?.trim() || "",
    assignedTo: row[19]?.trim() || "",
    notes: row[20]?.trim() || "",
    errorMessage: row[21]?.trim() || "",
    cachedAnalysis: parseAnalysis(row[22] || ""),
  };
}

function leadToRow(lead: Partial<Lead> & { rowIndex?: number }): string[] {
  return [
    lead.leadId ?? "",
    lead.email ?? "",
    lead.firstName ?? "",
    lead.lastName ?? "",
    lead.companyName ?? "",
    lead.industry ?? "",
    lead.metaAdLibraryUrl ?? "",
    lead.closingCopy ?? "",
    lead.stage ?? "1",
    lead.status ?? "ready",
    lead.email1SentAt ?? "",
    lead.email2SentAt ?? "",
    lead.email3SentAt ?? "",
    lead.email4SentAt ?? "",
    lead.email5SentAt ?? "",
    lead.email6SentAt ?? "",
    lead.gmailThreadId ?? "",
    lead.lastGmailMessageId ?? "",
    lead.respondedAt ?? "",
    lead.assignedTo ?? "",
    lead.notes ?? "",
    lead.errorMessage ?? "",
    lead.cachedAnalysis ? JSON.stringify(lead.cachedAnalysis) : "",
  ];
}

function patchLeadsCache(rowIndex: number, updates: Partial<Lead>) {
  if (leadsCache) {
    leadsCache.data = leadsCache.data.map((l) =>
      l.rowIndex === rowIndex ? { ...l, ...updates } : l
    );
  }
  const row = rowCache.get(rowIndex);
  if (row) {
    rowCache.set(rowIndex, { lead: { ...row.lead, ...updates }, at: Date.now() });
  }
}

export async function ensureSheetTab(): Promise<void> {
  const auth = getAuth();
  const sheets = google.sheets({ version: "v4", auth });
  const spreadsheetId = getSpreadsheetId();

  const meta = await sheets.spreadsheets.get({ spreadsheetId });
  const exists = meta.data.sheets?.some((s) => s.properties?.title === SHEET_TAB_NAME);

  if (!exists) {
    await sheets.spreadsheets.batchUpdate({
      spreadsheetId,
      requestBody: {
        requests: [
          {
            addSheet: {
              properties: { title: SHEET_TAB_NAME },
            },
          },
        ],
      },
    });
  }

  const headerRes = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: `${SHEET_TAB_NAME}!A1:W1`,
  });

  const firstRow = headerRes.data.values?.[0];
  if (!firstRow || firstRow[0] !== SHEET_HEADERS[0]) {
    await sheets.spreadsheets.values.update({
      spreadsheetId,
      range: `${SHEET_TAB_NAME}!A1:W1`,
      valueInputOption: "RAW",
      requestBody: { values: [SHEET_HEADERS as unknown as string[]] },
    });
  }
}

export async function fetchLeadByRow(
  rowIndex: number,
  options?: { fresh?: boolean }
): Promise<Lead | null> {
  if (!options?.fresh) {
    const rowCached = rowCache.get(rowIndex);
    if (rowCached && Date.now() - rowCached.at < ROW_CACHE_MS) {
      return rowCached.lead;
    }
    if (leadsCache && Date.now() - leadsCache.at < LEADS_CACHE_MS) {
      const cached = leadsCache.data.find((l) => l.rowIndex === rowIndex);
      if (cached) return cached;
    }
  }

  const auth = getAuth();
  const sheets = google.sheets({ version: "v4", auth });
  const spreadsheetId = getSpreadsheetId();

  const res = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: `${SHEET_TAB_NAME}!A${rowIndex}:W${rowIndex}`,
  });

  const row = res.data.values?.[0] as string[] | undefined;
  if (!row) return null;
  const lead = rowToLead(row, rowIndex);
  if (lead) patchRowCache(rowIndex, lead);
  return lead;
}

export async function fetchAllLeads(options?: { fresh?: boolean }): Promise<Lead[]> {
  if (!options?.fresh && leadsCache && Date.now() - leadsCache.at < LEADS_CACHE_MS) {
    return leadsCache.data;
  }

  const auth = getAuth();
  const sheets = google.sheets({ version: "v4", auth });
  const spreadsheetId = getSpreadsheetId();

  const res = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: `${SHEET_TAB_NAME}!A2:W`,
  });

  const rows = res.data.values || [];
  const leads = rows
    .map((row, i) => rowToLead(row as string[], i + 2))
    .filter((l): l is Lead => l !== null);

  leadsCache = { data: leads, at: Date.now() };
  for (const lead of leads) {
    patchRowCache(lead.rowIndex, lead);
  }
  return leads;
}

export async function updateLeadRow(
  rowIndex: number,
  updates: Partial<Lead>,
  existing?: Lead
): Promise<void> {
  const auth = getAuth();
  const sheets = google.sheets({ version: "v4", auth });
  const spreadsheetId = getSpreadsheetId();

  let current = existing ?? null;
  if (!current) {
    const row = await fetchLeadByRow(rowIndex, { fresh: true });
    current = row ?? ({} as Lead);
  }

  const merged = { ...current, ...updates };
  const rowData = leadToRow(merged);

  await sheets.spreadsheets.values.update({
    spreadsheetId,
    range: `${SHEET_TAB_NAME}!A${rowIndex}:W${rowIndex}`,
    valueInputOption: "RAW",
    requestBody: { values: [rowData] },
  });

  patchLeadsCache(rowIndex, updates);
  if (leadsCache) {
    leadsCache.at = Date.now();
  }
  patchRowCache(rowIndex, merged as Lead);
}

export function getSheetUrl(rowIndex?: number): string {
  const id = process.env.GOOGLE_SHEETS_SPREADSHEET_ID;
  const base = `https://docs.google.com/spreadsheets/d/${id}/edit?gid=${SHEET_TAB_GID}#gid=${SHEET_TAB_GID}`;
  if (rowIndex) return `${base}&range=A${rowIndex}`;
  return base;
}

export function nextStage(current: LeadStage): LeadStage {
  const order: LeadStage[] = ["1", "2", "3", "4", "5", "6", "Response Received"];
  const idx = order.indexOf(current);
  if (idx < 0 || idx >= 5) return current;
  return order[idx + 1];
}

export function stageToSentField(stage: LeadStage): keyof Lead | null {
  const map: Record<string, keyof Lead> = {
    "1": "email1SentAt",
    "2": "email2SentAt",
    "3": "email3SentAt",
    "4": "email4SentAt",
    "5": "email5SentAt",
    "6": "email6SentAt",
  };
  return map[stage] ?? null;
}
