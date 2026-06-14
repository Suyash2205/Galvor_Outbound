import { bestCompanyMatch, normalizeEmail } from "./company-match";
import { fetchAllLeads, stageToSentField } from "./sheets";
import { batchUpdateTrackerEmailFields, fetchTrackerContactRows } from "./outreach-sheets";
import type { Lead, PipelineSyncResult } from "./types";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function formatTrackerDate(raw: string): string {
  if (!raw?.trim()) return "";
  if (/^\d{1,2}-[A-Za-z]{3}-\d{2}$/.test(raw.trim())) return raw.trim();

  const d = new Date(raw);
  if (isNaN(d.getTime())) return raw.trim();
  return `${d.getDate()}-${MONTHS[d.getMonth()]}-${String(d.getFullYear()).slice(-2)}`;
}

function latestSentDate(lead: Lead): string {
  const dates = [
    lead.email6SentAt,
    lead.email5SentAt,
    lead.email4SentAt,
    lead.email3SentAt,
    lead.email2SentAt,
    lead.email1SentAt,
    lead.respondedAt,
  ].filter(Boolean);
  if (!dates.length) return "";
  const parsed = dates
    .map((d) => ({ raw: d, ts: new Date(d).getTime() }))
    .filter((x) => !isNaN(x.ts));
  if (!parsed.length) return dates[0];
  parsed.sort((a, b) => b.ts - a.ts);
  return formatTrackerDate(parsed[0].raw);
}

export function derivePipelineEmailFields(lead: Lead): {
  emailStatus: string;
  lastEmailDate: string;
  emailOutcome: string;
} {
  if (lead.respondedAt || lead.stage === "Response Received" || lead.status === "responded") {
    return {
      emailStatus: "Response Received",
      lastEmailDate: formatTrackerDate(lead.respondedAt || latestSentDate(lead)),
      emailOutcome: "Responded",
    };
  }

  const stageNum = parseInt(lead.stage, 10);
  let emailsSent = 0;
  if (!isNaN(stageNum) && stageNum >= 2) {
    emailsSent = stageNum - 1;
  } else {
    for (let s = 1; s <= 6; s++) {
      const field = stageToSentField(String(s) as Lead["stage"]);
      if (field && lead[field]) emailsSent = Math.max(emailsSent, s);
    }
  }

  if (emailsSent <= 0) {
    return { emailStatus: "", lastEmailDate: "", emailOutcome: "" };
  }

  return {
    emailStatus: `Email ${emailsSent} Sent`,
    lastEmailDate: latestSentDate(lead),
    emailOutcome: "No Response",
  };
}

export async function syncPipelineToTracker(options?: {
  overwrite?: boolean;
}): Promise<PipelineSyncResult> {
  const [trackerRows, pipelineLeads] = await Promise.all([
    fetchTrackerContactRows(),
    fetchAllLeads({ fresh: true }),
  ]);

  const emailIndex = new Map<string, Lead>();
  for (const lead of pipelineLeads) {
    const email = normalizeEmail(lead.email);
    if (email) emailIndex.set(email, lead);
  }

  const companyLeads = pipelineLeads.filter((l) => l.companyName?.trim());

  const updates: {
    rowIndex: number;
    emailStatus: string;
    lastEmailDate: string;
    emailOutcome: string;
  }[] = [];

  const unmatchedBrands = new Set<string>();
  let matchedByEmail = 0;
  let matchedByCompany = 0;
  let skipped = 0;

  for (const row of trackerRows) {
    if (
      !options?.overwrite &&
      row.emailStatus &&
      row.lastEmailDate &&
      row.emailOutcome
    ) {
      skipped++;
      continue;
    }

    let lead: Lead | null = null;
    const email = normalizeEmail(row.email);
    if (email && emailIndex.has(email)) {
      lead = emailIndex.get(email)!;
      matchedByEmail++;
    } else {
      const match = bestCompanyMatch(row.brand, companyLeads, (l) => l.companyName);
      if (match) {
        lead = match.item;
        matchedByCompany++;
      }
    }

    if (!lead) {
      unmatchedBrands.add(row.brand);
      continue;
    }

    const fields = derivePipelineEmailFields(lead);
    if (!fields.emailStatus && !fields.lastEmailDate) {
      skipped++;
      continue;
    }

    updates.push({ rowIndex: row.rowIndex, ...fields });
  }

  await batchUpdateTrackerEmailFields(updates);

  return {
    updated: updates.length,
    skipped,
    unmatched: [...unmatchedBrands].sort(),
    matchedByEmail,
    matchedByCompany,
  };
}
