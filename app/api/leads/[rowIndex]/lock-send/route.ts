import { NextResponse } from "next/server";
import { requireSession } from "@/lib/auth";
import { fetchLeadByRow, updateLeadRow } from "@/lib/sheets";

/** Mark a lead as sending before generation/send so cancel can stop in-flight work */
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

    if (lead.stage === "Response Received") {
      return NextResponse.json({ error: "Lead has already responded." }, { status: 409 });
    }

    if (lead.status === "sending") {
      return NextResponse.json({ error: "Already sending" }, { status: 409 });
    }

    if (lead.status !== "ready") {
      return NextResponse.json(
        { error: `Cannot send while status is ${lead.status}` },
        { status: 409 }
      );
    }

    await updateLeadRow(idx, { status: "sending", errorMessage: "" }, lead);
    return NextResponse.json({ ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Lock failed";
    const status = message === "Unauthorized" ? 401 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
