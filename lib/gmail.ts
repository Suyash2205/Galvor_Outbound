import { google } from "googleapis";

function encodeMessage(raw: string): string {
  return Buffer.from(raw)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

function buildRawEmail(params: {
  from: string;
  to: string;
  subject: string;
  htmlBody: string;
  plainBody: string;
  threadId?: string;
  inReplyTo?: string;
  references?: string;
}): string {
  const boundary = `boundary_${Date.now()}`;
  const headers = [
    `From: ${params.from}`,
    `To: ${params.to}`,
    `Subject: ${params.subject}`,
    "MIME-Version: 1.0",
    `Content-Type: multipart/alternative; boundary="${boundary}"`,
  ];

  if (params.inReplyTo) headers.push(`In-Reply-To: ${params.inReplyTo}`);
  if (params.references) headers.push(`References: ${params.references}`);

  const body = [
    `--${boundary}`,
    'Content-Type: text/plain; charset="UTF-8"',
    "",
    params.plainBody,
    `--${boundary}`,
    'Content-Type: text/html; charset="UTF-8"',
    "",
    params.htmlBody,
    `--${boundary}--`,
  ].join("\r\n");

  return `${headers.join("\r\n")}\r\n\r\n${body}`;
}

export async function sendGmailMessage(params: {
  accessToken: string;
  from: string;
  to: string;
  subject: string;
  htmlBody: string;
  plainBody: string;
  threadId?: string;
  inReplyTo?: string;
  references?: string;
}): Promise<{ messageId: string; threadId: string }> {
  const oauth2 = new google.auth.OAuth2();
  oauth2.setCredentials({ access_token: params.accessToken });
  const gmail = google.gmail({ version: "v1", auth: oauth2 });

  const raw = buildRawEmail(params);
  const res = await gmail.users.messages.send({
    userId: "me",
    requestBody: {
      raw: encodeMessage(raw),
      threadId: params.threadId || undefined,
    },
  });

  return {
    messageId: res.data.id || "",
    threadId: res.data.threadId || params.threadId || "",
  };
}

export async function checkThreadForReply(params: {
  accessToken: string;
  threadId: string;
  leadEmail: string;
  senderEmail: string;
  afterTimestamp?: number;
}): Promise<boolean> {
  const oauth2 = new google.auth.OAuth2();
  oauth2.setCredentials({ access_token: params.accessToken });
  const gmail = google.gmail({ version: "v1", auth: oauth2 });

  const thread = await gmail.users.threads.get({
    userId: "me",
    id: params.threadId,
    format: "metadata",
    metadataHeaders: ["From", "Date"],
  });

  const leadEmailLower = params.leadEmail.toLowerCase();
  const senderLower = params.senderEmail.toLowerCase();

  for (const msg of thread.data.messages || []) {
    const headers = msg.payload?.headers || [];
    const from = headers.find((h) => h.name === "From")?.value || "";
    const dateStr = headers.find((h) => h.name === "Date")?.value || "";
    const date = dateStr ? new Date(dateStr).getTime() : 0;

    if (params.afterTimestamp && date < params.afterTimestamp) continue;

    const fromLower = from.toLowerCase();
    if (fromLower.includes(leadEmailLower) && !fromLower.includes(senderLower)) {
      return true;
    }
  }

  return false;
}

export function getGmailThreadUrl(threadId: string): string {
  return `https://mail.google.com/mail/u/0/#inbox/${threadId}`;
}
