import { google } from "googleapis";
import type { gmail_v1 } from "googleapis";
import { followUpSubject } from "./email/templates";

const MAX_QUOTE_CHARS = 2500;

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

function headerValue(
  headers: gmail_v1.Schema$MessagePartHeader[] | undefined,
  name: string
): string {
  return (
    headers?.find((h) => h.name?.toLowerCase() === name.toLowerCase())?.value?.trim() || ""
  );
}

function decodeBodyData(data?: string | null): string {
  if (!data) return "";
  return Buffer.from(data.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf-8");
}

function extractPartBody(
  payload: gmail_v1.Schema$MessagePart | undefined,
  mimeType: "text/plain" | "text/html"
): string {
  if (!payload) return "";
  if (payload.mimeType === mimeType && payload.body?.data) {
    return decodeBodyData(payload.body.data);
  }
  for (const part of payload.parts || []) {
    const found = extractPartBody(part, mimeType);
    if (found) return found;
  }
  return "";
}

function truncateQuote(text: string): string {
  const trimmed = text.trim();
  if (trimmed.length <= MAX_QUOTE_CHARS) return trimmed;
  return `${trimmed.slice(0, MAX_QUOTE_CHARS).trim()}\n\n[...]`;
}

function formatQuoteAttribution(dateHeader: string, fromHeader: string): string {
  const date = dateHeader ? new Date(dateHeader) : new Date();
  const formatted = Number.isNaN(date.getTime())
    ? dateHeader
    : date.toLocaleString("en-US", {
        weekday: "short",
        month: "short",
        day: "numeric",
        year: "numeric",
        hour: "numeric",
        minute: "2-digit",
        hour12: true,
      });
  return `On ${formatted}, ${fromHeader} wrote:`;
}

export interface ThreadReplyContext {
  threadId: string;
  subject: string;
  inReplyTo: string;
  references: string;
  quote: {
    attribution: string;
    plain: string;
    html?: string;
  };
}

export async function getThreadReplyContext(
  accessToken: string,
  threadId: string,
  parentGmailMessageId: string
): Promise<ThreadReplyContext | null> {
  const oauth2 = new google.auth.OAuth2();
  oauth2.setCredentials({ access_token: accessToken });
  const gmail = google.gmail({ version: "v1", auth: oauth2 });

  const thread = await gmail.users.threads.get({
    userId: "me",
    id: threadId,
    format: "metadata",
    metadataHeaders: ["Message-ID", "Subject", "From", "Date"],
  });

  const messages = thread.data.messages || [];
  if (!messages.length) return null;

  const messageIds: string[] = [];
  for (const message of messages) {
    const messageId = headerValue(message.payload?.headers, "Message-ID");
    if (messageId) messageIds.push(messageId);
  }

  const firstHeaders = messages[0].payload?.headers;
  const originalSubject = headerValue(firstHeaders, "Subject");
  if (!originalSubject) return null;

  const parentMessage =
    messages.find((m) => m.id === parentGmailMessageId) || messages[messages.length - 1];
  if (!parentMessage?.id) return null;

  const parentHeaders = parentMessage.payload?.headers;
  const inReplyTo = headerValue(parentHeaders, "Message-ID");
  if (!inReplyTo) return null;

  const parentFull = await gmail.users.messages.get({
    userId: "me",
    id: parentMessage.id,
    format: "full",
  });

  const plain = truncateQuote(
    extractPartBody(parentFull.data.payload, "text/plain") ||
      parentFull.data.snippet ||
      ""
  );
  const html = truncateQuote(extractPartBody(parentFull.data.payload, "text/html"));

  return {
    threadId,
    subject: followUpSubject(originalSubject),
    inReplyTo,
    references: messageIds.join(" "),
    quote: {
      attribution: formatQuoteAttribution(
        headerValue(parentHeaders, "Date"),
        headerValue(parentHeaders, "From")
      ),
      plain,
      html: html || undefined,
    },
  };
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

export async function getThreadMessageIdChain(
  accessToken: string,
  threadId: string
): Promise<string[]> {
  const oauth2 = new google.auth.OAuth2();
  oauth2.setCredentials({ access_token: accessToken });
  const gmail = google.gmail({ version: "v1", auth: oauth2 });

  const thread = await gmail.users.threads.get({
    userId: "me",
    id: threadId,
    format: "metadata",
    metadataHeaders: ["Message-ID"],
  });

  const ids: string[] = [];
  for (const message of thread.data.messages || []) {
    const messageId = headerValue(message.payload?.headers, "Message-ID");
    if (messageId) ids.push(messageId);
  }
  return ids;
}

export async function getThreadFirstSubject(
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
    metadataHeaders: ["Subject"],
  });

  const first = thread.data.messages?.[0];
  return headerValue(first?.payload?.headers, "Subject") || null;
}

export async function resolveFollowUpHeaders(
  accessToken: string,
  lastGmailMessageId: string,
  gmailThreadId: string
): Promise<{
  threadId: string;
  subject?: string;
  inReplyTo?: string;
  references?: string;
}> {
  if (!gmailThreadId) {
    throw new Error("gmail_thread_id is required for follow-up emails.");
  }

  const [chain, originalSubject] = await Promise.all([
    getThreadMessageIdChain(accessToken, gmailThreadId),
    getThreadFirstSubject(accessToken, gmailThreadId),
  ]);

  let inReplyTo: string | undefined;
  if (lastGmailMessageId) {
    const parentId = await getMessageIdHeader(accessToken, lastGmailMessageId);
    if (parentId) inReplyTo = parentId;
  }
  if (!inReplyTo && chain.length) {
    inReplyTo = chain[chain.length - 1];
  }

  return {
    threadId: gmailThreadId,
    subject: originalSubject ? followUpSubject(originalSubject) : undefined,
    inReplyTo,
    references: chain.length ? chain.join(" ") : inReplyTo,
  };
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
