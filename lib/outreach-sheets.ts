import { google } from "googleapis";
import {
  buildColumnMap,
  colLetter,
  getCol,
  TRACKER_LEGACY_COLUMN_INDEX,
  type TrackerColumnKey,
  type TrackerColumnMap,
} from "./tracker-headers";
import {
  OUTREACH_ACTIVITY_HEADERS,
  OUTREACH_ACTIVITY_TAB_NAME,
  BRAND_TRACKER_TAB_NAME,
  type OutreachActivity,
  type OutreachBrand,
  type OutreachCategory,
} from "./types";
import { isValidActivityCategory, fetchCustomIndustryCategories, appendCustomIndustryCategory, fetchActivityCategories } from "./outreach-categories";

function uniqueSorted(values: string[]): string[] {
  return [...new Set(values.map((v) => v.trim()).filter(Boolean))].sort((a, b) =>
    a.localeCompare(b, undefined, { sensitivity: "base" })
  );
}

function setRowCell(
  row: string[],
  colMap: TrackerColumnMap,
  key: TrackerColumnKey,
  value: string
): void {
  const idx = colMap[key];
  if (idx === undefined) return;
  while (row.length <= idx) row.push("");
  row[idx] = value;
}

export async function fetchIndustryCategories(): Promise<string[]> {
  const rows = await fetchBrandTrackerRows();
  const fromTracker = rows.map((r) => r.industry).filter(Boolean);
  const custom = await fetchCustomIndustryCategories();
  return uniqueSorted([...fromTracker, ...custom]);
}

export async function addIndustryCategory(name: string): Promise<string[]> {
  const trimmed = name.trim();
  if (!trimmed) throw new Error("Category name is required.");

  const existing = await fetchIndustryCategories();
  if (existing.some((c) => c.toLowerCase() === trimmed.toLowerCase())) {
    return existing;
  }

  await appendCustomIndustryCategory(trimmed);
  return fetchIndustryCategories();
}

export async function appendTrackerBrand(input: {
  brand: string;
  category: string;
  firstName: string;
  lastName: string;
  source: string;
  owner: string;
}): Promise<{ rowIndex: number; brand: string }> {
  const brand = input.brand.trim();
  if (!brand) throw new Error("Company / Brand is required.");

  const tab = await getTrackerTab();
  const colMap = await fetchHeaderMap(tab);
  if (colMap.brand === undefined) {
    throw new Error("Company / Brand column not found on tracker sheet.");
  }

  const auth = getAuth();
  const sheets = google.sheets({ version: "v4", auth });
  const spreadsheetId = getSpreadsheetId();

  const res = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: `${tab}!A${DATA_START}:AZ`,
  });

  const rowIndex = DATA_START + (res.data.values?.length || 0);
  const maxIdx = Math.max(...Object.values(colMap), TRACKER_LEGACY_COLUMN_INDEX);
  const row = new Array(maxIdx + 1).fill("");

  setRowCell(row, colMap, "brand", brand);
  setRowCell(row, colMap, "category", input.category.trim());
  setRowCell(row, colMap, "firstName", input.firstName.trim());
  setRowCell(row, colMap, "lastName", input.lastName.trim());
  setRowCell(row, colMap, "source", input.source.trim());
  setRowCell(row, colMap, "owner", input.owner.trim());

  const endCol = colLetter(maxIdx);
  await sheets.spreadsheets.values.update({
    spreadsheetId,
    range: `${tab}!A${rowIndex}:${endCol}${rowIndex}`,
    valueInputOption: "RAW",
    requestBody: { values: [row] },
  });

  return { rowIndex, brand };
}

const HEADER_ROW = 3;
const DATA_START = 4;

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
    throw new Error("GOOGLE_OUTREACH_TRACKER_SPREADSHEET_ID is not configured.");
  }
  return id;
}

async function listTabNames(): Promise<string[]> {
  const auth = getAuth();
  const sheets = google.sheets({ version: "v4", auth });
  const meta = await sheets.spreadsheets.get({ spreadsheetId: getSpreadsheetId() });
  return meta.data.sheets?.map((s) => s.properties?.title || "") || [];
}

async function resolveTab(preferred: string[]): Promise<string> {
  const tabs = await listTabNames();
  for (const name of preferred) {
    if (tabs.includes(name)) return name;
  }
  return tabs[0] || preferred[0];
}

async function getTrackerTab(): Promise<string> {
  const envTab = process.env.OUTREACH_TRACKER_TAB_NAME;
  const preferred = [envTab, BRAND_TRACKER_TAB_NAME, "Tracker", "New Contacts"].filter(
    Boolean
  ) as string[];
  return resolveTab(preferred);
}

async function fetchHeaderMap(tab: string): Promise<TrackerColumnMap> {
  const auth = getAuth();
  const sheets = google.sheets({ version: "v4", auth });
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: getSpreadsheetId(),
    range: `${tab}!A${HEADER_ROW}:AZ${HEADER_ROW}`,
  });
  return buildColumnMap((res.data.values?.[0] as string[]) || []);
}

export async function fetchTrackerBrands(): Promise<OutreachBrand[]> {
  const tab = await getTrackerTab();
  const colMap = await fetchHeaderMap(tab);
  const auth = getAuth();
  const sheets = google.sheets({ version: "v4", auth });

  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: getSpreadsheetId(),
    range: `${tab}!A${DATA_START}:B`,
  });

  const counts = new Map<string, number>();
  for (const row of res.data.values || []) {
    const brand = getCol(row as string[], colMap, "brand");
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
  industry: string;
  email: string;
  legacyComments: string;
  sheetComments: string;
  emailStatus: string;
  lastEmailDate: string;
  emailOutcome: string;
}

export async function fetchBrandTrackerRows(): Promise<TrackerContactRow[]> {
  const tab = await getTrackerTab();
  const colMap = await fetchHeaderMap(tab);
  const auth = getAuth();
  const sheets = google.sheets({ version: "v4", auth });

  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: getSpreadsheetId(),
    range: `${tab}!A${DATA_START}:AZ`,
  });

  const rows: TrackerContactRow[] = [];
  for (let i = 0; i < (res.data.values || []).length; i++) {
    const row = res.data.values![i] as string[];
    const brand = getCol(row, colMap, "brand");
    if (!brand) continue;
    rows.push({
      rowIndex: DATA_START + i,
      brand,
      industry: getCol(row, colMap, "category"),
      email: getCol(row, colMap, "email"),
      legacyComments: getCol(row, colMap, "legacyComments") || row[TRACKER_LEGACY_COLUMN_INDEX]?.trim() || "",
      sheetComments: getCol(row, colMap, "comments"),
      emailStatus: getCol(row, colMap, "emailStatus"),
      lastEmailDate: getCol(row, colMap, "lastEmailDate"),
      emailOutcome: getCol(row, colMap, "emailOutcome"),
    });
  }
  return rows;
}

/** @deprecated alias */
export const fetchTrackerContactRows = fetchBrandTrackerRows;

export async function batchUpdateTrackerEmailFields(
  updates: { rowIndex: number; emailStatus: string; lastEmailDate: string; emailOutcome: string }[]
): Promise<void> {
  if (!updates.length) return;

  const tab = await getTrackerTab();
  const colMap = await fetchHeaderMap(tab);
  const statusIdx = colMap.emailStatus;
  const outcomeIdx = colMap.emailOutcome;
  if (statusIdx === undefined || outcomeIdx === undefined) {
    throw new Error("Email Status / Email Outcome columns not found on tracker sheet.");
  }

  const auth = getAuth();
  const sheets = google.sheets({ version: "v4", auth });
  const startCol = colLetter(statusIdx);
  const endCol = colLetter(outcomeIdx);

  await sheets.spreadsheets.values.batchUpdate({
    spreadsheetId: getSpreadsheetId(),
    requestBody: {
      valueInputOption: "RAW",
      data: updates.map((u) => ({
        range: `${tab}!${startCol}${u.rowIndex}:${endCol}${u.rowIndex}`,
        values: [[u.emailStatus, u.lastEmailDate, u.emailOutcome]],
      })),
    },
  });
}

export async function batchUpdateBrandTrackerFields(
  updates: { rowIndex: number; finalStatus: string; comments: string }[]
): Promise<void> {
  if (!updates.length) return;

  const tab = await getTrackerTab();
  const colMap = await fetchHeaderMap(tab);
  const statusIdx = colMap.finalStatus;
  const commentsIdx = colMap.comments;
  if (statusIdx === undefined || commentsIdx === undefined) {
    throw new Error("Final Status / Comments columns not found on tracker sheet.");
  }

  const auth = getAuth();
  const sheets = google.sheets({ version: "v4", auth });

  await sheets.spreadsheets.values.batchUpdate({
    spreadsheetId: getSpreadsheetId(),
    requestBody: {
      valueInputOption: "RAW",
      data: updates.map((u) => ({
        range: `${tab}!${colLetter(statusIdx)}${u.rowIndex}:${colLetter(commentsIdx)}${u.rowIndex}`,
        values: [[u.finalStatus, u.comments]],
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

async function rowToActivity(
  row: string[],
  rowIndex: number,
  allowedCategories: Set<string>
): Promise<OutreachActivity | null> {
  if (!row[2]?.trim() && !row[4]?.trim()) return null;
  const category = row[3]?.trim() || "";
  if (!category || !allowedCategories.has(category.toLowerCase())) return null;

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

  const allowed = await fetchActivityCategories();
  const allowedCategories = new Set(allowed.map((c) => c.toLowerCase()));

  let activities = (
    await Promise.all(
      (res.data.values || []).map((row, i) =>
        rowToActivity(row as string[], i + 2, allowedCategories)
      )
    )
  ).filter((a): a is OutreachActivity => a !== null);

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
  if (!(await isValidActivityCategory(input.category))) {
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
  return `https://docs.google.com/spreadsheets/d/${getSpreadsheetId()}/edit?gid=1535921837`;
}
