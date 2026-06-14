import {
  checkApifyRun,
  decodeApifyJob,
  encodeApifyJob,
  fetchApifyDataset,
  processApifyItems,
  startApifyRun,
  type ProcessedAd,
} from "./apify";
import { generateAnalysis } from "./claude";
import {
  buildEmail1Content,
  buildEmail2Content,
  buildPlaceholderEmail,
} from "./email/templates";
import { fetchLeadByRow, updateLeadRow } from "./sheets";
import { needsEmail1Import } from "./lead-import";
import {
  DEFAULT_CLOSING_COPY,
  type EmailContent,
  type Lead,
} from "./types";

export type JobPhase = "ready" | "scraping" | "fetching" | "analyzing" | "error";

export interface JobStatus {
  phase: JobPhase;
  message: string;
  email?: EmailContent;
  lead?: Lead;
}

const ADS_PREFIX = "ADS_DATA:";

function encodeAds(ads: ProcessedAd[]): string {
  return `${ADS_PREFIX}${JSON.stringify(ads)}`;
}

function decodeAds(notes: string): ProcessedAd[] | null {
  if (!notes?.startsWith(ADS_PREFIX)) return null;
  try {
    return JSON.parse(notes.slice(ADS_PREFIX.length)) as ProcessedAd[];
  } catch {
    return null;
  }
}

async function getLeadByRow(rowIndex: number, fresh = false): Promise<Lead> {
  const lead = await fetchLeadByRow(rowIndex, fresh ? { fresh: true } : undefined);
  if (!lead) throw new Error(`Lead not found at row ${rowIndex}`);
  return lead;
}

function buildFromCache(lead: Lead): EmailContent | null {
  const closing = lead.closingCopy || DEFAULT_CLOSING_COPY;
  const { companyName: brandName, firstName, industry, cachedAnalysis, stage } = lead;
  if (!cachedAnalysis) return null;

  if (stage === "1") {
    return buildEmail1Content(brandName, firstName, industry, closing, cachedAnalysis);
  }
  if (stage === "2") {
    return buildEmail2Content(brandName, cachedAnalysis);
  }
  const stageNum = parseInt(stage, 10);
  if (stageNum >= 3 && stageNum <= 6) {
    return buildPlaceholderEmail(stageNum, brandName, firstName);
  }
  return null;
}

function needsScrape(lead: Lead): boolean {
  if (lead.cachedAnalysis) return false;
  // Only Email 1 stage scrapes; stage 2+ should use Import Email 1 instead
  return lead.stage === "1";
}

function missingCacheMessage(lead: Lead): string {
  return needsEmail1Import(lead)
    ? "No cached analysis. Use Import Email 1 to paste the sent email and build the cache without re-scraping."
    : "Email not ready. Wait for generation to finish.";
}

function emailFromLeadAndAnalysis(lead: Lead): EmailContent {
  const closing = lead.closingCopy || DEFAULT_CLOSING_COPY;
  if (!lead.cachedAnalysis) throw new Error("Missing analysis");
  if (lead.stage === "1") {
    return buildEmail1Content(
      lead.companyName,
      lead.firstName,
      lead.industry,
      closing,
      lead.cachedAnalysis
    );
  }
  return buildEmail2Content(lead.companyName, lead.cachedAnalysis);
}

export async function startLeadJob(rowIndex: number): Promise<JobStatus> {
  const lead = await getLeadByRow(rowIndex);

  if (lead.stage === "Response Received") {
    throw new Error("Lead has already responded.");
  }

  const cachedEmail = buildFromCache(lead);
  if (cachedEmail) {
    return { phase: "ready", message: "Email ready.", email: cachedEmail, lead };
  }

  const stageNum = parseInt(lead.stage, 10);
  if (stageNum >= 3 && stageNum <= 6) {
    if (!lead.cachedAnalysis) {
      const email = buildPlaceholderEmail(stageNum, lead.companyName, lead.firstName);
      return {
        phase: "ready",
        message: "Placeholder email (import Email 1 to enable full follow-ups later).",
        email,
        lead,
      };
    }
    const email = buildPlaceholderEmail(stageNum, lead.companyName, lead.firstName);
    return { phase: "ready", message: "Email ready.", email, lead };
  }

  if (needsEmail1Import(lead)) {
    return { phase: "error", message: missingCacheMessage(lead), lead };
  }

  if (!lead.metaAdLibraryUrl) {
    throw new Error("Meta Ad Library URL is required.");
  }

  if (decodeApifyJob(lead.notes) || decodeAds(lead.notes)) {
    return pollLeadJob(rowIndex);
  }

  const ref = await startApifyRun(lead.metaAdLibraryUrl);
  await updateLeadRow(
    rowIndex,
    { notes: encodeApifyJob(ref), errorMessage: "" },
    lead
  );
  return {
    phase: "scraping",
    message: "Started Apify scraper… (usually 1–3 min)",
    lead,
  };
}

export async function pollLeadJob(rowIndex: number): Promise<JobStatus> {
  let lead = await getLeadByRow(rowIndex);

  if (lead.stage === "Response Received") {
    throw new Error("Lead has already responded.");
  }

  const cachedEmail = buildFromCache(lead);
  if (cachedEmail) {
    return { phase: "ready", message: "Email ready.", email: cachedEmail, lead };
  }

  const stageNum = parseInt(lead.stage, 10);
  if (stageNum >= 3 && stageNum <= 6) {
    if (!lead.cachedAnalysis) {
      const email = buildPlaceholderEmail(stageNum, lead.companyName, lead.firstName);
      return {
        phase: "ready",
        message: "Placeholder email (import Email 1 to enable full follow-ups later).",
        email,
        lead,
      };
    }
    const email = buildPlaceholderEmail(stageNum, lead.companyName, lead.firstName);
    return { phase: "ready", message: "Email ready.", email, lead };
  }

  if (needsEmail1Import(lead)) {
    return { phase: "error", message: missingCacheMessage(lead), lead };
  }

  const pendingAds = decodeAds(lead.notes);
  if (pendingAds) {
    try {
      const analysis = await generateAnalysis(
        lead.companyName,
        lead.industry,
        lead.firstName,
        pendingAds
      );
      await updateLeadRow(
        rowIndex,
        { cachedAnalysis: analysis, notes: "", status: "ready", errorMessage: "" },
        lead
      );
      lead = { ...lead, cachedAnalysis: analysis, notes: "", status: "ready", errorMessage: "" };
      const email = emailFromLeadAndAnalysis(lead);
      return { phase: "ready", message: "Email generated.", email, lead };
    } catch (err) {
      const message = err instanceof Error ? err.message : "Claude analysis failed";
      await updateLeadRow(
        rowIndex,
        { status: "error", errorMessage: message, notes: "" },
        lead
      );
      return { phase: "error", message, lead };
    }
  }

  const job = decodeApifyJob(lead.notes);
  if (!job) {
    if (needsScrape(lead)) {
      return startLeadJob(rowIndex);
    }
    throw new Error("No generation job in progress.");
  }

  const { status, datasetId } = await checkApifyRun(job.runId);

  if (status === "RUNNING" || status === "READY") {
    return {
      phase: "scraping",
      message: "Scraping Meta Ad Library… (usually 1–3 min)",
      lead,
    };
  }

  if (["FAILED", "ABORTED", "TIMED-OUT"].includes(status)) {
    const message = `Apify run ${status.toLowerCase()}. Check your Ad Library URL.`;
    await updateLeadRow(
      rowIndex,
      { status: "error", notes: "", errorMessage: message },
      lead
    );
    return { phase: "error", message, lead };
  }

  if (status !== "SUCCEEDED") {
    return { phase: "scraping", message: `Apify status: ${status}…`, lead };
  }

  try {
    const items = await fetchApifyDataset(datasetId || job.datasetId);
    const ads = processApifyItems(items);
    if (!ads.length) {
      throw new Error("No ads with valid start dates found. Check the Ad Library URL.");
    }
    await updateLeadRow(rowIndex, { notes: encodeAds(ads) }, lead);
    return {
      phase: "analyzing",
      message: "Ads fetched — generating email with Claude…",
      lead: { ...lead, notes: encodeAds(ads) },
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to fetch ads";
    await updateLeadRow(
      rowIndex,
      { status: "error", notes: "", errorMessage: message },
      lead
    );
    return { phase: "error", message, lead };
  }
}

export async function ensureLeadReady(rowIndex: number): Promise<{
  lead: Lead;
  email: EmailContent;
}> {
  const lead = await getLeadByRow(rowIndex);
  const email = buildFromCache(lead);
  if (email) return { lead, email };

  const stageNum = parseInt(lead.stage, 10);
  if (stageNum >= 3 && stageNum <= 6) {
    return {
      lead,
      email: buildPlaceholderEmail(stageNum, lead.companyName, lead.firstName),
    };
  }

  throw new Error(missingCacheMessage(lead));
}
