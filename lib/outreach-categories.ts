import { google } from "googleapis";
import { DEFAULT_OUTREACH_CATEGORIES, OUTREACH_LOOKUPS_TAB_NAME } from "./types";

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

async function ensureLookupsTab(): Promise<void> {
  const auth = getAuth();
  const sheets = google.sheets({ version: "v4", auth });
  const spreadsheetId = getSpreadsheetId();

  const meta = await sheets.spreadsheets.get({ spreadsheetId });
  const exists = meta.data.sheets?.some((s) => s.properties?.title === OUTREACH_LOOKUPS_TAB_NAME);

  if (!exists) {
    await sheets.spreadsheets.batchUpdate({
      spreadsheetId,
      requestBody: {
        requests: [{ addSheet: { properties: { title: OUTREACH_LOOKUPS_TAB_NAME } } }],
      },
    });
  }

  const headerRes = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: `${OUTREACH_LOOKUPS_TAB_NAME}!A1:B1`,
  });

  const firstRow = headerRes.data.values?.[0];
  if (!firstRow || firstRow[0] !== "Activity category") {
    await sheets.spreadsheets.values.update({
      spreadsheetId,
      range: `${OUTREACH_LOOKUPS_TAB_NAME}!A1:B1`,
      valueInputOption: "RAW",
      requestBody: { values: [["Activity category", "Industry category"]] },
    });
  }
}

function uniqueSorted(values: string[]): string[] {
  return [...new Set(values.map((v) => v.trim()).filter(Boolean))].sort((a, b) =>
    a.localeCompare(b, undefined, { sensitivity: "base" })
  );
}

export async function fetchActivityCategories(): Promise<string[]> {
  await ensureLookupsTab();
  const auth = getAuth();
  const sheets = google.sheets({ version: "v4", auth });

  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: getSpreadsheetId(),
    range: `${OUTREACH_LOOKUPS_TAB_NAME}!A2:A`,
  });

  const custom = (res.data.values || []).map((row) => row[0]?.trim()).filter(Boolean) as string[];
  return uniqueSorted([...DEFAULT_OUTREACH_CATEGORIES, ...custom]);
}

export async function fetchCustomIndustryCategories(): Promise<string[]> {
  await ensureLookupsTab();
  const auth = getAuth();
  const sheets = google.sheets({ version: "v4", auth });

  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: getSpreadsheetId(),
    range: `${OUTREACH_LOOKUPS_TAB_NAME}!B2:B`,
  });

  return uniqueSorted(
    (res.data.values || []).map((row) => row[0]?.trim()).filter(Boolean) as string[]
  );
}

export async function addActivityCategory(name: string): Promise<string[]> {
  const trimmed = name.trim();
  if (!trimmed) throw new Error("Category name is required.");

  const existing = await fetchActivityCategories();
  if (existing.some((c) => c.toLowerCase() === trimmed.toLowerCase())) {
    return existing;
  }

  await ensureLookupsTab();
  const auth = getAuth();
  const sheets = google.sheets({ version: "v4", auth });

  await sheets.spreadsheets.values.append({
    spreadsheetId: getSpreadsheetId(),
    range: `${OUTREACH_LOOKUPS_TAB_NAME}!A:A`,
    valueInputOption: "RAW",
    insertDataOption: "INSERT_ROWS",
    requestBody: { values: [[trimmed]] },
  });

  return fetchActivityCategories();
}

export async function appendCustomIndustryCategory(name: string): Promise<void> {
  await ensureLookupsTab();
  const auth = getAuth();
  const sheets = google.sheets({ version: "v4", auth });

  await sheets.spreadsheets.values.append({
    spreadsheetId: getSpreadsheetId(),
    range: `${OUTREACH_LOOKUPS_TAB_NAME}!B:B`,
    valueInputOption: "RAW",
    insertDataOption: "INSERT_ROWS",
    requestBody: { values: [[name]] },
  });
}

export async function isValidActivityCategory(category: string): Promise<boolean> {
  const allowed = await fetchActivityCategories();
  return allowed.some((c) => c.toLowerCase() === category.trim().toLowerCase());
}
