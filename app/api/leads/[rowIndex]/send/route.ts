import { NextResponse } from "next/server";
import { requireSession } from "@/lib/auth";
import { sendLeadEmail } from "@/lib/send-lead";

export const maxDuration = 300;

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ rowIndex: string }> }
) {
  try {
    const session = await requireSession();
    const { rowIndex } = await params;

    const result = await sendLeadEmail({
      rowIndex: parseInt(rowIndex, 10),
      accessToken: session.accessToken!,
      senderEmail: session.user!.email!,
    });

    return NextResponse.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Send failed";
    const status = message === "Unauthorized" ? 401 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
