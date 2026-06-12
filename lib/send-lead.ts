import { ensureLeadReady } from "./lead-job";
import { sendGmailMessage } from "./gmail";
import {
  fetchAllLeads,
  nextStage,
  stageToSentField,
  updateLeadRow,
} from "./sheets";
import type { Lead } from "./types";

async function getLeadByRow(rowIndex: number): Promise<Lead> {
  const leads = await fetchAllLeads();
  const lead = leads.find((l) => l.rowIndex === rowIndex);
  if (!lead) throw new Error(`Lead not found at row ${rowIndex}`);
  return lead;
}

export async function sendLeadEmail(params: {
  rowIndex: number;
  accessToken: string;
  senderEmail: string;
}): Promise<{ lead: Lead; messageId: string; threadId: string }> {
  const { rowIndex, accessToken, senderEmail } = params;
  const lead = await getLeadByRow(rowIndex);

  if (lead.stage === "Response Received") {
    throw new Error("Lead has already responded.");
  }
  if (!lead.email) throw new Error("Lead email is missing.");
  if (lead.status === "generating" && !lead.cachedAnalysis) {
    throw new Error("Email is still generating. Wait for it to finish.");
  }

  const currentStage = lead.stage;
  await updateLeadRow(rowIndex, { status: "sending", errorMessage: "" });

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

    await updateLeadRow(rowIndex, updates);

    const updated = await getLeadByRow(rowIndex);
    return { lead: updated, messageId, threadId };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Send failed";
    await updateLeadRow(rowIndex, { status: "error", errorMessage: message });
    throw err;
  }
}
