import { NextResponse } from "next/server";
import { requireSession } from "@/lib/auth";
import { ensureSheetTab } from "@/lib/sheets";
import { SHEET_HEADERS, SHEET_TAB_NAME } from "@/lib/types";

export async function POST() {
  try {
    await requireSession();
    await ensureSheetTab();
    return NextResponse.json({
      ok: true,
      tab: SHEET_TAB_NAME,
      headers: SHEET_HEADERS,
      spreadsheetId: process.env.GOOGLE_SHEETS_SPREADSHEET_ID,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Init failed";
    const status = message === "Unauthorized" ? 401 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
