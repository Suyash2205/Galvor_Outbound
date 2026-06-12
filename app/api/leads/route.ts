import { NextResponse } from "next/server";
import { requireSession } from "@/lib/auth";
import { fetchAllLeads } from "@/lib/sheets";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    await requireSession();
    const leads = await fetchAllLeads();
    return NextResponse.json({ leads });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to fetch leads";
    const status = message === "Unauthorized" ? 401 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
