import { ensureLeadReady } from "./lead-job";
import { appendQuotedReply, appendSignature } from "./email/templates";
import {
  getGmailMessageUrl,
  getGmailSignature,
  getGmailThreadUrl,
  getThreadReplyContext,
  resolveFollowUpHeaders,
  sendGmailMessage,
} from "./gmail";
import {
  fetchLeadByRow,
  nextStage,
  stageToSentField,
  updateLeadRow,
} from "./sheets";
import type { Lead } from "./types";

function validateEmailContent(stage: string, plainBody: string, htmlBody: string) {
  const plain = plainBody?.trim() || "";
  const html = htmlBody?.replace(/<[^>]+>/g, "").trim() || "";

  if (!plain && !html) {
    if (stage === "2") {
      throw new Error(
        "Follow-up email body is empty. Open the sheet and check cached_analysis has followUpBody, or re-send Email 1 to regenerate."
      );
    }
    throw new Error("Email body is empty. Cannot send.");
  }
}

export async function sendLeadEmail(params: {
  rowIndex: number;
  accessToken: string;
  senderEmail: string;
}): Promise<{
  lead: Lead;
  messageId: string;
  threadId: string;
  sentUrl: string;
}> {
  const { rowIndex, accessToken, senderEmail } = params;
  const lead = await fetchLeadByRow(rowIndex, { fresh: true });
  if (!lead) throw new Error(`Lead not found at row ${rowIndex}`);

  if (lead.stage === "Response Received") {
    throw new Error("Lead has already responded.");
  }
  if (!lead.email) throw new Error("Lead email is missing.");
  if (lead.status === "generating" && !lead.cachedAnalysis) {
    throw new Error("Email is still generating. Wait for it to finish.");
  }

  const currentStage = lead.stage;
  await updateLeadRow(rowIndex, { status: "sending", errorMessage: "" }, lead);

  try {
    const { email } = await ensureLeadReady(rowIndex);
    validateEmailContent(currentStage, email.plainBody, email.htmlBody);

    const isFollowUp = currentStage !== "1";

    let subject = email.subject;
    let plainBody = email.plainBody;
    let htmlBody = email.htmlBody;
    let threadHeaders: { threadId?: string; inReplyTo?: string; references?: string } = {};
    let quoteContext: { attribution: string; plain: string; html?: string } | null = null;

    if (isFollowUp) {
      if (!lead.gmailThreadId) {
        throw new Error(
          "Missing gmail_thread_id. Follow-ups must be sent in the same Gmail thread as Email 1 — send Email 1 first."
        );
      }

      // Always reply inside the original Email 1 thread.
      threadHeaders.threadId = lead.gmailThreadId;

      if (lead.lastGmailMessageId) {
        const ctx = await getThreadReplyContext(
          accessToken,
          lead.gmailThreadId,
          lead.lastGmailMessageId
        );
        if (ctx) {
          subject = ctx.subject;
          threadHeaders = {
            threadId: ctx.threadId,
            inReplyTo: ctx.inReplyTo,
            references: ctx.references,
          };
          if (ctx.quote.plain.trim()) {
            quoteContext = ctx.quote;
          }
        }
      }

      if (!threadHeaders.inReplyTo) {
        const fallback = await resolveFollowUpHeaders(
          accessToken,
          lead.lastGmailMessageId,
          lead.gmailThreadId
        );
        threadHeaders = {
          threadId: fallback.threadId,
          inReplyTo: fallback.inReplyTo,
          references: fallback.references,
        };
        if (fallback.subject) subject = fallback.subject;
      }

      if (!threadHeaders.threadId || !threadHeaders.inReplyTo) {
        throw new Error(
          "Could not attach follow-up to the existing Gmail thread. Check gmail_thread_id in the sheet."
        );
      }
    }

    const signature = await getGmailSignature(accessToken, senderEmail);
    if (signature) {
      const withSignature = appendSignature(plainBody, htmlBody, signature);
      plainBody = withSignature.plainBody;
      htmlBody = withSignature.htmlBody;
    }

    if (quoteContext) {
      const quoted = appendQuotedReply(plainBody, htmlBody, quoteContext);
      plainBody = quoted.plainBody;
      htmlBody = quoted.htmlBody;
    }

    const { messageId, threadId } = await sendGmailMessage({
      accessToken,
      from: senderEmail,
      to: lead.email,
      subject,
      htmlBody,
      plainBody,
      ...threadHeaders,
    });

    if (isFollowUp && lead.gmailThreadId && threadId && threadId !== lead.gmailThreadId) {
      throw new Error(
        `Follow-up was not added to the original thread (got ${threadId}, expected ${lead.gmailThreadId}).`
      );
    }

    const now = new Date().toISOString();
    const sentField = stageToSentField(currentStage);
    const updates: Partial<Lead> = {
      status: "ready",
      gmailThreadId: threadId || lead.gmailThreadId,
      lastGmailMessageId: messageId,
      stage: nextStage(currentStage),
      errorMessage: "",
    };
    if (sentField) {
      (updates as Record<string, string>)[sentField] = now;
    }

    await updateLeadRow(rowIndex, updates, { ...lead, status: "sending" });

    const updated = await fetchLeadByRow(rowIndex, { fresh: true });
    if (!updated) throw new Error("Lead not found after send");

    return {
      lead: updated,
      messageId,
      threadId: threadId || lead.gmailThreadId,
      sentUrl: isFollowUp
        ? getGmailThreadUrl(lead.gmailThreadId)
        : getGmailMessageUrl(messageId),
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Send failed";
    await updateLeadRow(rowIndex, { status: "error", errorMessage: message }, lead);
    throw err;
  }
}
