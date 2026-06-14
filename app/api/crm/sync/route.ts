import { NextResponse } from "next/server";
import { requireSession } from "@/lib/auth";
import { syncCrmToPipeline } from "@/lib/crm-sync";

export async function POST() {
  try {
    await requireSession();
    const result = await syncCrmToPipeline();
    return NextResponse.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : "CRM sync failed";
    const status = message === "Unauthorized" ? 401 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
