import { NextResponse } from "next/server";
import { requireSession } from "@/lib/auth";
import { pollLeadJob, startLeadJob } from "@/lib/lead-job";

export const maxDuration = 60;

/** Legacy single-shot preview — prefer /job with polling from the client */
export async function POST(
  _req: Request,
  { params }: { params: Promise<{ rowIndex: string }> }
) {
  try {
    await requireSession();
    const { rowIndex } = await params;
    const idx = parseInt(rowIndex, 10);

    await startLeadJob(idx);
    const result = await pollLeadJob(idx);

    if (result.phase === "ready" && result.email && result.lead) {
      return NextResponse.json({
        lead: result.lead,
        stage: result.lead.stage,
        email: result.email,
      });
    }

    return NextResponse.json({
      phase: result.phase,
      message: result.message,
      usePolling: true,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Preview failed";
    const status = message === "Unauthorized" ? 401 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
