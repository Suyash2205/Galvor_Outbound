import { NextResponse } from "next/server";
import { google } from "googleapis";
import { isAuthorizedCronRequest } from "@/lib/cron-auth";
import { checkRepliesForAllLeads } from "@/lib/replies";

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
