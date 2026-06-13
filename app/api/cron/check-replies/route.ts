import { NextResponse } from "next/server";
import { google } from "googleapis";
import { checkRepliesForAllLeads } from "@/lib/replies";

function normalizeSecret(value: string | null | undefined): string {
  return (value || "").trim().replace(/:+$/, "");
}

function isAuthorizedCronRequest(req: Request): boolean {
  const cronSecret = normalizeSecret(process.env.CRON_SECRET);
  if (!cronSecret) return true;

  const url = new URL(req.url);
  const candidates = [
    req.headers.get("authorization"),
    req.headers.get("x-cron-secret"),
    url.searchParams.get("secret"),
  ]
    .map(normalizeSecret)
    .filter(Boolean);

  for (const candidate of candidates) {
    if (candidate === cronSecret) return true;
    if (candidate === `Bearer ${cronSecret}`) return true;
    if (candidate.startsWith("Bearer ") && candidate.slice(7) === cronSecret) return true;
  }

  return false;
}

export async function GET(req: Request) {
  if (!isAuthorizedCronRequest(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const senderEmail = process.env.CRON_SENDER_EMAIL;
  const refreshToken = process.env.CRON_GMAIL_REFRESH_TOKEN;

  if (!senderEmail || !refreshToken) {
    return NextResponse.json({
      skipped: true,
      reason: "CRON_SENDER_EMAIL and CRON_GMAIL_REFRESH_TOKEN not configured",
    });
  }

  try {
    const oauth2 = new google.auth.OAuth2(
      process.env.GOOGLE_CLIENT_ID,
      process.env.GOOGLE_CLIENT_SECRET
    );
    oauth2.setCredentials({ refresh_token: refreshToken });
    const { credentials } = await oauth2.refreshAccessToken();

    if (!credentials.access_token) {
      throw new Error("Failed to refresh Gmail access token");
    }

    const result = await checkRepliesForAllLeads({
      accessToken: credentials.access_token,
      senderEmail,
    });

    return NextResponse.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Cron failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
