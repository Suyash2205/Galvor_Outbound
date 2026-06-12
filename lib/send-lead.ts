import { ensureLeadReady } from "./lead-job";
import { getGmailMessageUrl, resolveFollowUpHeaders, sendGmailMessage } from "./gmail";
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

    let threadHeaders: { threadId?: string; inReplyTo?: string; references?: string } = {};
    if (isFollowUp) {
      if (!lead.lastGmailMessageId && !lead.gmailThreadId) {
        throw new Error(
          "Missing Email 1 thread info. Send Email 1 first, or check gmail_thread_id / last_gmail_message_id in the sheet."
        );
      }
      threadHeaders = await resolveFollowUpHeaders(
        accessToken,
        lead.lastGmailMessageId,
        lead.gmailThreadId
      );
    }

    const { messageId, threadId } = await sendGmailMessage({
      accessToken,
      from: senderEmail,
      to: lead.email,
      subject: email.subject,
      htmlBody: email.htmlBody,
      plainBody: email.plainBody,
      ...threadHeaders,
    });

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
      sentUrl: getGmailMessageUrl(messageId),
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Send failed";
    await updateLeadRow(rowIndex, { status: "error", errorMessage: message }, lead);
    throw err;
  }
}
