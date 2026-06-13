import { NextResponse } from "next/server";
import { requireSession } from "@/lib/auth";
import { fetchLeadByRow, updateLeadRow } from "@/lib/sheets";

/** Reset a lead stuck in generating after a cancelled preview */
export async function POST(
  _req: Request,
  { params }: { params: Promise<{ rowIndex: string }> }
) {
  try {
    await requireSession();
    const { rowIndex } = await params;
    const idx = parseInt(rowIndex, 10);

    const lead = await fetchLeadByRow(idx, { fresh: true });
    if (!lead) {
      return NextResponse.json({ error: "Lead not found" }, { status: 404 });
    }

    if (lead.status === "generating" || lead.status === "sending") {
      await updateLeadRow(idx, { status: "ready", errorMessage: "" }, lead);
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unlock failed";
    const status = message === "Unauthorized" ? 401 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
