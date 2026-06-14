import { requireAuth } from "@/lib/auth";
import { syncPipelineToTracker } from "@/lib/outreach-sync";
import { NextResponse } from "next/server";

export async function POST(req: Request) {
  try {
    await requireAuth();
    const body = await req.json().catch(() => ({}));
    const overwrite = Boolean((body as { overwrite?: boolean }).overwrite);

    const result = await syncPipelineToTracker({ overwrite });
    return NextResponse.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Pipeline sync failed";
    const status = message === "Unauthorized" ? 401 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
