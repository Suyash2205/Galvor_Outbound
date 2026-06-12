import { NextResponse } from "next/server";
import { requireSession } from "@/lib/auth";
import { pollLeadJob, startLeadJob } from "@/lib/lead-job";

export const maxDuration = 60;

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ rowIndex: string }> }
) {
  try {
    await requireSession();
    const { rowIndex } = await params;
    const result = await startLeadJob(parseInt(rowIndex, 10));
    return NextResponse.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Job start failed";
    const status = message === "Unauthorized" ? 401 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ rowIndex: string }> }
) {
  try {
    await requireSession();
    const { rowIndex } = await params;
    const result = await pollLeadJob(parseInt(rowIndex, 10));
    return NextResponse.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Job poll failed";
    const status = message === "Unauthorized" ? 401 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
