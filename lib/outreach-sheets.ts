import { google } from "googleapis";
import {
  OUTREACH_ACTIVITY_HEADERS,
  OUTREACH_ACTIVITY_TAB_NAME,
  OUTREACH_CATEGORIES,
  OUTREACH_TRACKER_TAB_NAME,
  type OutreachActivity,
  type OutreachBrand,
  type OutreachCategory,
} from "./types";

const TRACKER_HEADER_ROW = 3;
const TRACKER_DATA_START = 4;

/** Column indices (0-based) on the main tracker tab */
export const TRACKER_COL = {
  brand: 0, // A
  email: 9, // J
  emailStatus: 11, // L
  lastEmailDate: 12, // M
  emailOutcome: 13, // N
} as const;

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
  const id =
    process.env.GOOGLE_OUTREACH_TRACKER_SPREADSHEET_ID ||
    process.env.OUTREACH_TRACKER_SPREADSHEET_ID;
  if (!id) {
    throw new Error(
      "GOOGLE_OUTREACH_TRACKER_SPREADSHEET_ID is not configured."
    );
  }
  return id;
}

function getTrackerTabName() {
  return process.env.OUTREACH_TRACKER_TAB_NAME || OUTREACH_TRACKER_TAB_NAME;
}

function colLetter(index: number): string {
  let n = index + 1;
  let s = "";
  while (n > 0) {
    const rem = (n - 1) % 26;
    s = String.fromCharCode(65 + rem) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
}

async function resolveTrackerTab(): Promise<string> {
  const configured = getTrackerTabName();
  const auth = getAuth();
  const sheets = google.sheets({ version: "v4", auth });
  const spreadsheetId = getSpreadsheetId();
  const meta = await sheets.spreadsheets.get({ spreadsheetId });
  const titles = meta.data.sheets?.map((s) => s.properties?.title || "") || [];
  if (titles.includes(configured)) return configured;
  return titles[0] || configured;
}

export async function fetchTrackerBrands(): Promise<OutreachBrand[]> {
  const auth = getAuth();
  const sheets = google.sheets({ version: "v4", auth });
  const spreadsheetId = getSpreadsheetId();
  const tab = await resolveTrackerTab();

  const res = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: `${tab}!A${TRACKER_DATA_START}:A`,
  });

  const counts = new Map<string, number>();
  for (const row of res.data.values || []) {
    const brand = (row[0] as string | undefined)?.trim();
    if (!brand) continue;
    counts.set(brand, (counts.get(brand) || 0) + 1);
  }

  return [...counts.entries()]
    .map(([name, rowCount]) => ({ name, rowCount }))
    .sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: "base" }));
}

export interface TrackerContactRow {
  rowIndex: number;
  brand: string;
  email: string;
  emailStatus: string;
  lastEmailDate: string;
  emailOutcome: string;
}

export async function fetchTrackerContactRows(): Promise<TrackerContactRow[]> {
  const auth = getAuth();
  const sheets = google.sheets({ version: "v4", auth });
  const spreadsheetId = getSpreadsheetId();
  const tab = await resolveTrackerTab();

  const res = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: `${tab}!A${TRACKER_DATA_START}:N`,
  });

  const rows: TrackerContactRow[] = [];
  for (let i = 0; i < (res.data.values || []).length; i++) {
    const row = res.data.values![i] as string[];
    const brand = row[TRACKER_COL.brand]?.trim() || "";
    if (!brand) continue;
    rows.push({
      rowIndex: TRACKER_DATA_START + i,
      brand,
      email: row[TRACKER_COL.email]?.trim() || "",
      emailStatus: row[TRACKER_COL.emailStatus]?.trim() || "",
      lastEmailDate: row[TRACKER_COL.lastEmailDate]?.trim() || "",
      emailOutcome: row[TRACKER_COL.emailOutcome]?.trim() || "",
    });
  }
  return rows;
}

export async function batchUpdateTrackerEmailFields(
  updates: { rowIndex: number; emailStatus: string; lastEmailDate: string; emailOutcome: string }[]
): Promise<void> {
  if (!updates.length) return;

  const auth = getAuth();
  const sheets = google.sheets({ version: "v4", auth });
  const spreadsheetId = getSpreadsheetId();
  const tab = await resolveTrackerTab();

  const lCol = colLetter(TRACKER_COL.emailStatus);
  const nCol = colLetter(TRACKER_COL.emailOutcome);

  await sheets.spreadsheets.values.batchUpdate({
    spreadsheetId,
    requestBody: {
      valueInputOption: "RAW",
      data: updates.map((u) => ({
        range: `${tab}!${lCol}${u.rowIndex}:${nCol}${u.rowIndex}`,
        values: [[u.emailStatus, u.lastEmailDate, u.emailOutcome]],
      })),
    },
  });
}

export async function ensureActivityLogTab(): Promise<void> {
  const auth = getAuth();
  const sheets = google.sheets({ version: "v4", auth });
  const spreadsheetId = getSpreadsheetId();

  const meta = await sheets.spreadsheets.get({ spreadsheetId });
  const exists = meta.data.sheets?.some(
    (s) => s.properties?.title === OUTREACH_ACTIVITY_TAB_NAME
  );

  if (!exists) {
    await sheets.spreadsheets.batchUpdate({
      spreadsheetId,
      requestBody: {
        requests: [{ addSheet: { properties: { title: OUTREACH_ACTIVITY_TAB_NAME } } }],
      },
    });
  }

  const headerRes = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: `${OUTREACH_ACTIVITY_TAB_NAME}!A1:G1`,
  });

  const firstRow = headerRes.data.values?.[0];
  if (!firstRow || firstRow[0] !== OUTREACH_ACTIVITY_HEADERS[0]) {
    await sheets.spreadsheets.values.update({
      spreadsheetId,
      range: `${OUTREACH_ACTIVITY_TAB_NAME}!A1:G1`,
      valueInputOption: "RAW",
      requestBody: { values: [OUTREACH_ACTIVITY_HEADERS as unknown as string[]] },
    });
  }
}

function rowToActivity(row: string[], rowIndex: number): OutreachActivity | null {
  if (!row[2]?.trim() && !row[4]?.trim()) return null;
  const category = row[3]?.trim() as OutreachCategory;
  if (!OUTREACH_CATEGORIES.includes(category)) return null;

  return {
    rowIndex,
    loggedAt: row[0]?.trim() || "",
    activityDate: row[1]?.trim() || "",
    brand: row[2]?.trim() || "",
    category,
    comments: row[4]?.trim() || "",
    polishedComment: row[5]?.trim() || "",
    loggedBy: row[6]?.trim() || "",
  };
}

export async function fetchActivities(options?: {
  since?: string;
  limit?: number;
}): Promise<OutreachActivity[]> {
  await ensureActivityLogTab();
  const auth = getAuth();
  const sheets = google.sheets({ version: "v4", auth });
  const spreadsheetId = getSpreadsheetId();

  const res = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: `${OUTREACH_ACTIVITY_TAB_NAME}!A2:G`,
  });

  let activities = (res.data.values || [])
    .map((row, i) => rowToActivity(row as string[], i + 2))
    .filter((a): a is OutreachActivity => a !== null);

  if (options?.since) {
    const sinceMs = new Date(options.since).getTime();
    activities = activities.filter((a) => {
      const d = new Date(a.activityDate || a.loggedAt).getTime();
      return !isNaN(d) && d >= sinceMs;
    });
  }

  activities.sort((a, b) => {
    const da = new Date(a.activityDate || a.loggedAt).getTime();
    const db = new Date(b.activityDate || b.loggedAt).getTime();
    return db - da;
  });

  if (options?.limit) {
    activities = activities.slice(0, options.limit);
  }

  return activities;
}

export async function appendActivity(input: {
  activityDate: string;
  brand: string;
  category: OutreachCategory;
  comments: string;
  polishedComment?: string;
  loggedBy: string;
}): Promise<OutreachActivity> {
  if (!OUTREACH_CATEGORIES.includes(input.category)) {
    throw new Error(`Invalid category: ${input.category}`);
  }

  await ensureActivityLogTab();
  const auth = getAuth();
  const sheets = google.sheets({ version: "v4", auth });
  const spreadsheetId = getSpreadsheetId();

  const loggedAt = new Date().toISOString();
  const row = [
    loggedAt,
    input.activityDate,
    input.brand,
    input.category,
    input.comments,
    input.polishedComment || "",
    input.loggedBy,
  ];

  const appendRes = await sheets.spreadsheets.values.append({
    spreadsheetId,
    range: `${OUTREACH_ACTIVITY_TAB_NAME}!A:G`,
    valueInputOption: "RAW",
    insertDataOption: "INSERT_ROWS",
    requestBody: { values: [row] },
  });

  const updatedRange = appendRes.data.updates?.updatedRange || "";
  const match = updatedRange.match(/!A(\d+):/);
  const rowIndex = match ? parseInt(match[1], 10) : 0;

  return {
    rowIndex,
    loggedAt,
    activityDate: input.activityDate,
    brand: input.brand,
    category: input.category,
    comments: input.comments,
    polishedComment: input.polishedComment || "",
    loggedBy: input.loggedBy,
  };
}

export function getOutreachTrackerSheetUrl(): string {
  const id = getSpreadsheetId();
  return `https://docs.google.com/spreadsheets/d/${id}/edit`;
}
