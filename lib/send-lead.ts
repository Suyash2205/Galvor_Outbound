import { runApify, processApifyItems } from "./apify";
import { generateAnalysis } from "./claude";
import {
  buildEmail1Content,
  buildEmail2Content,
  buildPlaceholderEmail,
} from "./email/templates";
import { sendGmailMessage } from "./gmail";
import {
  fetchAllLeads,
  nextStage,
  stageToSentField,
  updateLeadRow,
} from "./sheets";
import { DEFAULT_CLOSING_COPY, type EmailContent, type Lead, type LeadStage } from "./types";

async function getLeadByRow(rowIndex: number): Promise<Lead> {
  const leads = await fetchAllLeads();
  const lead = leads.find((l) => l.rowIndex === rowIndex);
  if (!lead) throw new Error(`Lead not found at row ${rowIndex}`);
  return lead;
}

async function buildEmailForStage(lead: Lead, stage: LeadStage): Promise<EmailContent> {
  const closing = lead.closingCopy || DEFAULT_CLOSING_COPY;
  const brandName = lead.companyName;
  const { firstName, industry, metaAdLibraryUrl } = lead;

  if (stage === "1") {
    if (!metaAdLibraryUrl) throw new Error("Meta Ad Library URL is required for Email 1.");
    const items = await runApify(metaAdLibraryUrl);
    const ads = processApifyItems(items);
    if (!ads.length) throw new Error("No ads with valid start dates found. Check the Ad Library URL.");

    const analysis = await generateAnalysis(brandName, industry, firstName, ads);
    await updateLeadRow(lead.rowIndex, { cachedAnalysis: analysis });

    return buildEmail1Content(brandName, firstName, industry, closing, analysis);
  }

  if (stage === "2") {
    let analysis = lead.cachedAnalysis;
    if (!analysis) {
      if (!metaAdLibraryUrl) throw new Error("No cached analysis and no Ad Library URL for Email 2.");
      const items = await runApify(metaAdLibraryUrl);
      const ads = processApifyItems(items);
      analysis = await generateAnalysis(brandName, industry, firstName, ads);
      await updateLeadRow(lead.rowIndex, { cachedAnalysis: analysis });
    }
    if (!analysis.followUpBody) throw new Error("Follow-up body not generated. Regenerate from Email 1.");
    return buildEmail2Content(brandName, analysis);
  }

  const stageNum = parseInt(stage, 10);
  if (stageNum >= 3 && stageNum <= 6) {
    return buildPlaceholderEmail(stageNum, brandName, firstName);
  }

  throw new Error(`Cannot send email for stage: ${stage}`);
}

export async function previewLeadEmail(rowIndex: number): Promise<{
  lead: Lead;
  stage: LeadStage;
  email: EmailContent;
}> {
  const lead = await getLeadByRow(rowIndex);
  if (lead.stage === "Response Received") {
    throw new Error("Lead has already responded.");
  }
  const email = await buildEmailForStage(lead, lead.stage);
  return { lead, stage: lead.stage, email };
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
  if (lead.status === "generating" || lead.status === "sending") {
    throw new Error("Lead is already being processed.");
  }

  const currentStage = lead.stage;
  await updateLeadRow(rowIndex, { status: "generating", errorMessage: "" });

  try {
    const email = await buildEmailForStage(lead, currentStage);

    await updateLeadRow(rowIndex, { status: "sending" });

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
