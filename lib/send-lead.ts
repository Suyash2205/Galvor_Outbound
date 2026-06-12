import { ensureLeadReady } from "./lead-job";
import { sendGmailMessage } from "./gmail";
import {
  fetchLeadByRow,
  nextStage,
  stageToSentField,
  updateLeadRow,
} from "./sheets";
import type { Lead } from "./types";

export async function sendLeadEmail(params: {
  rowIndex: number;
  accessToken: string;
  senderEmail: string;
}): Promise<{ lead: Lead; messageId: string; threadId: string }> {
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

    const isFollowUp = currentStage !== "1";
    const { messageId, threadId } = await sendGmailMessage({
      accessToken,
      from: senderEmail,
      to: lead.email,
      subject: email.subject,
      htmlBody: email.htmlBody,
      plainBody: email.plainBody,
      threadId: isFollowUp ? lead.gmailThreadId : undefined,
      inReplyTo: isFollowUp ? lead.lastGmailMessageId : undefined,
      references: isFollowUp ? lead.lastGmailMessageId : undefined,
    });

    const now = new Date().toISOString();
    const sentField = stageToSentField(currentStage);
    const updates: Partial<Lead> = {
      status: "ready",
      gmailThreadId: threadId,
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
    return { lead: updated, messageId, threadId };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Send failed";
    await updateLeadRow(rowIndex, { status: "error", errorMessage: message }, lead);
    throw err;
  }
}
