import { google } from "googleapis";

function encodeMessage(raw: string): string {
  return Buffer.from(raw, "utf-8")
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

function encodeSubject(subject: string): string {
  if (/^[\x20-\x7E]*$/.test(subject)) return subject;
  const b64 = Buffer.from(subject, "utf-8").toString("base64");
  return `=?UTF-8?B?${b64}?=`;
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
  const plainB64 = Buffer.from(params.plainBody, "utf-8").toString("base64");
  const htmlB64 = Buffer.from(params.htmlBody, "utf-8").toString("base64");

  const headers = [
    `From: ${params.from}`,
    `To: ${params.to}`,
    `Subject: ${encodeSubject(params.subject)}`,
    "MIME-Version: 1.0",
    `Content-Type: multipart/alternative; boundary="${boundary}"`,
  ];

  if (params.inReplyTo) headers.push(`In-Reply-To: ${params.inReplyTo}`);
  if (params.references) headers.push(`References: ${params.references}`);

  const body = [
    `--${boundary}`,
    'Content-Type: text/plain; charset="UTF-8"',
    "Content-Transfer-Encoding: base64",
    "",
    plainB64,
    `--${boundary}`,
    'Content-Type: text/html; charset="UTF-8"',
    "Content-Transfer-Encoding: base64",
    "",
    htmlB64,
    `--${boundary}--`,
  ].join("\r\n");

  return `${headers.join("\r\n")}\r\n\r\n${body}`;
}

export async function getMessageIdHeader(
  accessToken: string,
  gmailApiMessageId: string
): Promise<string | null> {
  const oauth2 = new google.auth.OAuth2();
  oauth2.setCredentials({ access_token: accessToken });
  const gmail = google.gmail({ version: "v1", auth: oauth2 });

  const msg = await gmail.users.messages.get({
    userId: "me",
    id: gmailApiMessageId,
    format: "metadata",
    metadataHeaders: ["Message-ID"],
  });

  const header = msg.data.payload?.headers?.find((h) => h.name === "Message-ID")?.value;
  return header?.trim() || null;
}

export async function getFirstMessageIdInThread(
  accessToken: string,
  threadId: string
): Promise<string | null> {
  const oauth2 = new google.auth.OAuth2();
  oauth2.setCredentials({ access_token: accessToken });
  const gmail = google.gmail({ version: "v1", auth: oauth2 });

  const thread = await gmail.users.threads.get({
    userId: "me",
    id: threadId,
    format: "metadata",
    metadataHeaders: ["Message-ID"],
  });

  const first = thread.data.messages?.[0];
  if (!first?.id) return null;
  return getMessageIdHeader(accessToken, first.id);
}

export async function resolveFollowUpHeaders(
  accessToken: string,
  lastGmailMessageId: string,
  gmailThreadId: string
): Promise<{ threadId?: string; inReplyTo?: string; references?: string }> {
  const base = gmailThreadId ? { threadId: gmailThreadId } : {};

  if (!lastGmailMessageId && !gmailThreadId) return {};

  try {
    let messageIdHeader: string | null = null;
    if (lastGmailMessageId) {
      messageIdHeader = await getMessageIdHeader(accessToken, lastGmailMessageId);
    }
    if (!messageIdHeader && gmailThreadId) {
      messageIdHeader = await getFirstMessageIdInThread(accessToken, gmailThreadId);
    }
    if (!messageIdHeader) return base;

    return {
      ...base,
      inReplyTo: messageIdHeader,
      references: messageIdHeader,
    };
  } catch {
    return base;
  }
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

  if (!res.data.id) {
    throw new Error("Gmail did not return a message ID. Email may not have been sent.");
  }

  return {
    messageId: res.data.id,
    threadId: res.data.threadId || params.threadId || "",
  };
}

export function getGmailMessageUrl(messageId: string): string {
  return `https://mail.google.com/mail/u/0/#sent/${messageId}`;
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
