import { requireAuth } from "@/lib/auth";
import { getBrandTrackerViews } from "@/lib/tracker-brand-sync";
import { NextResponse } from "next/server";

export async function GET() {
  try {
    await requireAuth();
    const brands = await getBrandTrackerViews();
    return NextResponse.json({ brands });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to load tracker";
    const status = message === "Unauthorized" ? 401 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
