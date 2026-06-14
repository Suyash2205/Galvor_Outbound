import {
  appendPipelineRows,
  fetchAllLeads,
  fetchCrmSourceRows,
  leadToRow,
} from "./sheets";

export interface CrmSyncResult {
  scanned: number;
  imported: number;
  skipped: number;
  skippedNoEmail: number;
}

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

/** CRM columns: A=email, B=first, C=last, E=company, F=industry, K=meta ad library */
function crmRowToPipelineRow(row: string[]): string[] | null {
  const email = row[0]?.trim() || "";
  const firstName = row[1]?.trim() || "";
  const lastName = row[2]?.trim() || "";
  const companyName = row[4]?.trim() || "";
  const industry = row[5]?.trim() || "";
  const metaAdLibraryUrl = row[10]?.trim() || "";

  if (!email) return null;

  return leadToRow({
    leadId: email,
    email,
    firstName,
    lastName,
    companyName,
    industry,
    metaAdLibraryUrl,
    stage: "1",
    status: "ready",
  });
}

export async function syncCrmToPipeline(): Promise<CrmSyncResult> {
  const [crmRows, pipelineLeads] = await Promise.all([
    fetchCrmSourceRows(),
    fetchAllLeads({ fresh: true }),
  ]);

  const existingEmails = new Set(
    pipelineLeads.map((lead) => normalizeEmail(lead.email)).filter(Boolean)
  );

  const toAppend: string[][] = [];
  const seenThisRun = new Set<string>();
  let skippedNoEmail = 0;

  for (const row of crmRows) {
    const pipelineRow = crmRowToPipelineRow(row);
    if (!pipelineRow) {
      skippedNoEmail++;
      continue;
    }

    const email = normalizeEmail(pipelineRow[1] || "");
    if (!email || existingEmails.has(email) || seenThisRun.has(email)) {
      continue;
    }

    seenThisRun.add(email);
    toAppend.push(pipelineRow);
  }

  if (toAppend.length) {
    await appendPipelineRows(toAppend);
  }

  return {
    scanned: crmRows.length,
    imported: toAppend.length,
    skipped: crmRows.length - toAppend.length - skippedNoEmail,
    skippedNoEmail,
  };
}
