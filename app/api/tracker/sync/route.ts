import { requireAuth } from "@/lib/auth";
import { syncBrandTrackerToSheet } from "@/lib/tracker-brand-sync";
import { NextResponse } from "next/server";

export async function POST(req: Request) {
  try {
    await requireAuth();
    const body = await req.json().catch(() => ({}));
    const brand = (body as { brand?: string }).brand;

    const result = await syncBrandTrackerToSheet(brand ? { brand } : undefined);
    return NextResponse.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Tracker sync failed";
    const status = message === "Unauthorized" ? 401 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
