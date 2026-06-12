import { NextResponse } from "next/server";
import { requireSession } from "@/lib/auth";
import { previewLeadEmail } from "@/lib/send-lead";

export const maxDuration = 300;

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ rowIndex: string }> }
) {
  try {
    await requireSession();
    const { rowIndex } = await params;
    const result = await previewLeadEmail(parseInt(rowIndex, 10));
    return NextResponse.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Preview failed";
    const status = message === "Unauthorized" ? 401 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
