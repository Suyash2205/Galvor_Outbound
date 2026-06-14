import { requireAuth } from "@/lib/auth";
import { fetchTrackerBrands } from "@/lib/outreach-sheets";
import { NextResponse } from "next/server";

export async function GET() {
  try {
    await requireAuth();
    const brands = await fetchTrackerBrands();
    return NextResponse.json({ brands });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to load brands";
    const status = message === "Unauthorized" ? 401 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
