import { NextResponse } from "next/server";
import { requireSession } from "@/lib/auth";
import { fetchAllLeads, updateLeadRow } from "@/lib/sheets";

/** Reset a lead stuck in generating after a cancelled preview */
export async function POST(
  _req: Request,
  { params }: { params: Promise<{ rowIndex: string }> }
) {
  try {
    await requireSession();
    const { rowIndex } = await params;
    const idx = parseInt(rowIndex, 10);

    const leads = await fetchAllLeads();
    const lead = leads.find((l) => l.rowIndex === idx);
    if (!lead) {
      return NextResponse.json({ error: "Lead not found" }, { status: 404 });
    }

    if (lead.status === "sending") {
      return NextResponse.json({ error: "Cannot unlock while sending" }, { status: 409 });
    }

    if (lead.status === "generating") {
      await updateLeadRow(idx, { status: "ready", errorMessage: "" });
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unlock failed";
    const status = message === "Unauthorized" ? 401 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
