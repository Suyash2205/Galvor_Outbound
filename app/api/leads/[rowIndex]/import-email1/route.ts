import { NextResponse } from "next/server";
import { requireSession } from "@/lib/auth";
import { generateAnalysisFromEmail1 } from "@/lib/claude";
import { fetchLeadByRow, invalidateLeadsCache, updateLeadRow } from "@/lib/sheets";

export const maxDuration = 60;

export async function POST(
  req: Request,
  { params }: { params: Promise<{ rowIndex: string }> }
) {
  try {
    await requireSession();
    const { rowIndex } = await params;
    const idx = parseInt(rowIndex, 10);
    const body = await req.json();
    const email1Body = String(body.email1Body || "").trim();

    if (!email1Body) {
      return NextResponse.json({ error: "Email 1 body is required." }, { status: 400 });
    }

    const lead = await fetchLeadByRow(idx, { fresh: true });
    if (!lead) {
      return NextResponse.json({ error: "Lead not found" }, { status: 404 });
    }

    if (lead.cachedAnalysis) {
      return NextResponse.json({ error: "This lead already has cached analysis." }, { status: 409 });
    }

    const stageNum = parseInt(lead.stage, 10);
    if (stageNum < 2 || stageNum > 6) {
      return NextResponse.json(
        { error: "Import Email 1 is for leads at stage 2–6 without cached data." },
        { status: 400 }
      );
    }

    const analysis = await generateAnalysisFromEmail1(
      lead.companyName,
      lead.industry,
      lead.firstName,
      email1Body
    );

    await updateLeadRow(
      idx,
      { cachedAnalysis: analysis, status: "ready", errorMessage: "" },
      lead
    );
    invalidateLeadsCache();

    return NextResponse.json({ ok: true, cachedAnalysis: analysis });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Import failed";
    const status = message === "Unauthorized" ? 401 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
