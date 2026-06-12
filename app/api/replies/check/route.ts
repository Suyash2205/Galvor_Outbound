import { NextResponse } from "next/server";
import { requireSession } from "@/lib/auth";
import { checkRepliesForAllLeads } from "@/lib/replies";

export async function POST() {
  try {
    const session = await requireSession();
    const result = await checkRepliesForAllLeads({
      accessToken: session.accessToken!,
      senderEmail: session.user!.email!,
    });
    return NextResponse.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Reply check failed";
    const status = message === "Unauthorized" ? 401 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
