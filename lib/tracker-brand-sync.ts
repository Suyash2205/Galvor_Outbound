import { bestCompanyMatch, companyMatchScore } from "./company-match";
import { fetchAllLeads, stageToSentField } from "./sheets";
import {
  batchUpdateBrandTrackerFields,
  fetchBrandTrackerRows,
  fetchActivities,
} from "./outreach-sheets";
import type { Lead, OutreachActivity, BrandTrackerSyncResult, BrandTrackerView, BrandTrackerComment } from "./types";

const ORDINALS = ["", "1st", "2nd", "3rd", "4th", "5th", "6th"];

function formatShortDate(dateStr: string): string {
  if (!dateStr?.trim()) return "";
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) {
    const m = dateStr.match(/(\d{1,2})[/-](\d{1,2})/);
    return m ? `${m[1]}/${m[2]}` : dateStr.trim();
  }
  return `${d.getDate()}/${d.getMonth() + 1}`;
}

function activitiesForBrand(brand: string, activities: OutreachActivity[]): OutreachActivity[] {
  return activities
    .filter((a) => companyMatchScore(a.brand, brand) >= 0.68)
    .sort((a, b) => {
      const da = new Date(a.activityDate || a.loggedAt).getTime();
      const db = new Date(b.activityDate || b.loggedAt).getTime();
      return da - db;
    });
}

function leadsForBrand(brand: string, leads: Lead[]): Lead[] {
  return leads.filter((l) => companyMatchScore(l.companyName, brand) >= 0.68);
}

function isEmailOnlyLine(text: string): boolean {
  const t = text.toLowerCase().trim();
  return (
    /intro\s+email\s+sent/.test(t) ||
    /\d+(st|nd|rd|th)\s+email\s+sent/.test(t) ||
    /only\s+outbound\s+email/.test(t) ||
    /^email\s+\d+\s+sent/.test(t)
  );
}

function filterWorkComments(thread: BrandTrackerComment[]): BrandTrackerComment[] {
  return thread.filter((c) => !isEmailOnlyLine(c.text));
}

function getMaxEmailSentForLead(lead: Lead): { n: number; date: string } {
  let maxN = 0;
  let maxDate = "";

  for (let n = 1; n <= 6; n++) {
    const field = stageToSentField(String(n) as Lead["stage"]);
    if (!field) continue;
    const val = lead[field];
    if (typeof val === "string" && val.trim()) {
      maxN = n;
      maxDate = formatShortDate(val);
    }
  }

  if (maxN === 0) {
    const stageNum = parseInt(lead.stage, 10);
    if (!isNaN(stageNum) && stageNum >= 2) {
      maxN = stageNum - 1;
      const field = stageToSentField(String(maxN) as Lead["stage"]);
      if (field) {
        const val = lead[field];
        if (typeof val === "string" && val.trim()) maxDate = formatShortDate(val);
      }
    }
  }

  return { n: maxN, date: maxDate };
}

function deriveEmailFinalStatus(brandLeads: Lead[]): string {
  let maxN = 0;
  let maxDate = "";

  for (const lead of brandLeads) {
    const { n, date } = getMaxEmailSentForLead(lead);
    if (n > maxN) {
      maxN = n;
      maxDate = date;
    } else if (n === maxN && date && !maxDate) {
      maxDate = date;
    }
  }

  if (maxN <= 0) return "";

  const label =
    maxN === 1 ? "Intro email sent" : `${ORDINALS[maxN] || `${maxN}th`} email sent`;
  return maxDate ? `${maxDate} - ${label}` : label;
}

export function parseLegacyComments(raw: string): BrandTrackerComment[] {
  const text = raw.trim();
  if (!text || text === "0") return [];

  const newlineLines = text
    .split(/\n+/)
    .map((p) => p.trim())
    .filter((p) => p && p !== "0");
  if (newlineLines.length > 1) {
    return newlineLines.map((line) => {
      const dated = line.match(/^(\d{1,2}\/\d{1,2})\s*-\s*(.+)$/);
      if (dated) {
        return { date: dated[1], text: dated[2].trim(), category: "Legacy" };
      }
      return { date: "", text: line, category: "Legacy" };
    });
  }

  const parts = text
    .split(/(?:\s*\/\s*)?(?=\d{1,2}\/\d{1,2}\s*-\s*)/)
    .map((p) => p.replace(/^\s*\/\s*/, "").trim())
    .filter((p) => p && p !== "0");

  if (!parts.length) return [];

  return parts.map((part) => {
    const dated = part.match(/^(\d{1,2}\/\d{1,2})\s*-\s*(.+)$/);
    if (dated) {
      return { date: dated[1], text: dated[2].trim(), category: "Legacy" };
    }
    return { date: "", text: part, category: "Legacy" };
  });
}

type TrackerLegacyRow = { legacyComments: string; sheetComments?: string };

function legacySources(row: TrackerLegacyRow): string[] {
  return [row.legacyComments, row.sheetComments]
    .map((t) => t?.trim())
    .filter((t): t is string => Boolean(t) && t !== "0");
}

/** Column I first; column L only when I is empty (avoids duplicating synced outreach lines). */
function legacySourcesForThread(row: TrackerLegacyRow): string[] {
  const legacy = row.legacyComments?.trim();
  if (legacy && legacy !== "0") return [legacy];
  const sheet = row.sheetComments?.trim();
  if (sheet && sheet !== "0") return [sheet];
  return [];
}

function hasLegacyWork(legacyRaw: string): boolean {
  return filterWorkComments(parseLegacyComments(legacyRaw)).length > 0;
}

function rowHasLegacyWork(row: TrackerLegacyRow): boolean {
  return legacySources(row).some((raw) => hasLegacyWork(raw));
}

function hasAnyWorkHistory(
  brand: string,
  activities: OutreachActivity[],
  legacyRaw: string,
  brandRows?: TrackerLegacyRow[]
): boolean {
  if (activitiesForBrand(brand, activities).length > 0) return true;
  if (hasLegacyWork(legacyRaw)) return true;
  if (brandRows?.some((r) => rowHasLegacyWork(r))) return true;
  return false;
}

function collectLegacyThreads(brandRows: TrackerLegacyRow[]): BrandTrackerComment[] {
  const seen = new Set<string>();
  const thread: BrandTrackerComment[] = [];

  for (const row of brandRows) {
    for (const raw of legacySourcesForThread(row)) {
      for (const c of parseLegacyComments(raw)) {
        const key = `${c.date}|${c.text}`;
        if (seen.has(key)) continue;
        seen.add(key);
        thread.push(c);
      }
    }
  }

  return thread;
}

function pickLegacyTextForBrand(rows: TrackerLegacyRow[]): string {
  const texts = rows.flatMap((r) => legacySourcesForThread(r));
  if (!texts.length) return "";
  // Prefer the longest entry — usually the most complete history for the brand
  return texts.sort((a, b) => b.length - a.length)[0];
}

export function buildCommentThread(brandActivities: OutreachActivity[]): BrandTrackerComment[] {
  const thread: BrandTrackerComment[] = [];
  for (const a of brandActivities) {
    const text = (a.polishedComment || a.comments).trim();
    if (!text) continue;
    thread.push({
      date: formatShortDate(a.activityDate || a.loggedAt),
      text,
      category: a.category,
    });
  }
  return thread;
}

/** Sheet column L — work comments only (no intro/email-only lines) */
export function buildCommentsText(
  legacyThread: BrandTrackerComment[],
  brandActivities: OutreachActivity[]
): string {
  const workLegacy = filterWorkComments(legacyThread);
  const activityThread = buildCommentThread(brandActivities);
  return [...workLegacy, ...activityThread]
    .map((c) => (c.date ? `${c.date} - ${c.text}` : c.text))
    .join("\n");
}

export function mergeCommentThreads(
  legacyThread: BrandTrackerComment[],
  activityThread: BrandTrackerComment[]
): BrandTrackerComment[] {
  return [...filterWorkComments(legacyThread), ...activityThread];
}

function extractEmailStatusFromLegacy(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed || trimmed === "0") return "";

  const thread = parseLegacyComments(trimmed);
  const emailLines = thread.filter((c) => isEmailOnlyLine(c.text));

  if (!emailLines.length) {
    if (isEmailOnlyLine(trimmed)) {
      const dated = trimmed.match(/^(\d{1,2}\/\d{1,2})\s*-\s*(.+)$/);
      return dated ? `${dated[1]} - ${dated[2].trim()}` : trimmed;
    }
    return "";
  }

  const ranked = emailLines.map((c) => {
    const t = c.text.toLowerCase();
    let n = 1;
    const ord = t.match(/(\d+)(st|nd|rd|th)\s+email/);
    if (ord) n = parseInt(ord[1], 10);
    return { ...c, n };
  });
  ranked.sort((a, b) => b.n - a.n);
  const best = ranked[0];
  return best.date ? `${best.date} - ${best.text}` : best.text;
}

export function deriveFinalStatus(
  brand: string,
  activities: OutreachActivity[],
  pipelineLeads: Lead[],
  legacyRaw = "",
  brandRows?: TrackerLegacyRow[]
): string {
  // Active lead: outreach app log OR real work notes in column I
  if (hasAnyWorkHistory(brand, activities, legacyRaw, brandRows)) return "Active lead";

  const brandLeads = leadsForBrand(brand, pipelineLeads);

  if (brandLeads.length) {
    const hasResponse = brandLeads.some(
      (l) =>
        Boolean(l.respondedAt?.trim()) ||
        l.stage === "Response Received" ||
        l.status === "responded"
    );
    if (hasResponse) return "Response received but no work done";

    const pipelineStatus = deriveEmailFinalStatus(brandLeads);
    if (pipelineStatus) return pipelineStatus;
  }

  // Manual history in column I (e.g. "4/6 - Intro email sent")
  return extractEmailStatusFromLegacy(legacyRaw);
}

export function classifyFinalStatus(finalStatus: string): BrandTrackerView["statusCategory"] {
  const s = finalStatus.toLowerCase();
  if (!s) return "empty";
  if (s.includes("active lead") || s.includes("active client")) return "active";
  if (s.includes("response received but no work")) return "response_no_work";
  if (s.includes("intro email sent") || s.includes("email sent") || s.includes("outbound email")) {
    return "email_only";
  }
  return "other";
}

export function buildBrandTrackerViews(
  trackerRows: Awaited<ReturnType<typeof fetchBrandTrackerRows>>,
  activities: OutreachActivity[],
  pipelineLeads: Lead[]
): BrandTrackerView[] {
  const rowsByBrand = new Map<string, typeof trackerRows>();
  for (const row of trackerRows) {
    const key = row.brand.trim();
    if (!key) continue;
    const list = rowsByBrand.get(key) || [];
    list.push(row);
    rowsByBrand.set(key, list);
  }

  const views: BrandTrackerView[] = [];

  for (const [key, brandRows] of rowsByBrand) {
    const brandActivities = activitiesForBrand(key, activities);
    const legacyRaw = pickLegacyTextForBrand(brandRows);
    const legacyThread = collectLegacyThreads(brandRows);
    const finalStatus = deriveFinalStatus(
      key,
      activities,
      pipelineLeads,
      legacyRaw,
      brandRows
    );
    const activityThread = buildCommentThread(brandActivities);
    const commentThread = mergeCommentThreads(legacyThread, activityThread);
    const comments = buildCommentsText(legacyThread, brandActivities);
    const lastActivity = brandActivities[brandActivities.length - 1];

    views.push({
      brand: key,
      industry: brandRows.find((r) => r.industry)?.industry || "",
      finalStatus,
      comments,
      commentThread,
      latestComment: commentThread.length ? commentThread[commentThread.length - 1] : null,
      lastActivityDate: lastActivity
        ? lastActivity.activityDate || lastActivity.loggedAt.slice(0, 10)
        : commentThread.length
          ? commentThread[commentThread.length - 1].date
          : "",
      rowIndices: brandRows.map((r) => r.rowIndex),
      hasActivityLog:
        brandActivities.length > 0 || brandRows.some((r) => rowHasLegacyWork(r)),
      statusCategory: classifyFinalStatus(finalStatus),
    });
  }

  return views.sort((a, b) =>
    a.brand.localeCompare(b.brand, undefined, { sensitivity: "base" })
  );
}

export async function syncBrandTrackerToSheet(options?: {
  brand?: string;
}): Promise<BrandTrackerSyncResult> {
  const [trackerRows, activities, pipelineLeads] = await Promise.all([
    fetchBrandTrackerRows(),
    fetchActivities(),
    fetchAllLeads({ fresh: true }),
  ]);

  const views = buildBrandTrackerViews(trackerRows, activities, pipelineLeads);
  const targetBrands = options?.brand?.trim()
    ? views.filter((v) => companyMatchScore(v.brand, options.brand!) >= 0.68)
    : views;

  const updates: { rowIndex: number; finalStatus: string; comments: string }[] = [];
  for (const row of trackerRows) {
    if (options?.brand?.trim() && companyMatchScore(row.brand, options.brand) < 0.68) {
      continue;
    }

    const key = row.brand.trim();
    const brandActivities = activitiesForBrand(key, activities);
    const brandRowsForKey = trackerRows.filter(
      (r) => companyMatchScore(r.brand, key) >= 0.68
    );
    const legacyThread = collectLegacyThreads(brandRowsForKey);
    const finalStatus = deriveFinalStatus(
      key,
      activities,
      pipelineLeads,
      row.legacyComments || row.sheetComments,
      brandRowsForKey
    );
    const comments = buildCommentsText(legacyThread, brandActivities);

    updates.push({
      rowIndex: row.rowIndex,
      finalStatus,
      comments,
    });
  }

  await batchUpdateBrandTrackerFields(updates);

  return {
    updated: updates.length,
    brands: targetBrands.length,
    activeLeads: targetBrands.filter((v) => v.statusCategory === "active").length,
    emailOnly: targetBrands.filter((v) => v.statusCategory === "email_only").length,
    responseNoWork: targetBrands.filter((v) => v.statusCategory === "response_no_work").length,
  };
}

export async function getBrandTrackerViews(): Promise<BrandTrackerView[]> {
  const [trackerRows, activities, pipelineLeads] = await Promise.all([
    fetchBrandTrackerRows(),
    fetchActivities(),
    fetchAllLeads({ fresh: true }),
  ]);
  return buildBrandTrackerViews(trackerRows, activities, pipelineLeads);
}

export function findBestBrandMatch(
  query: string,
  brands: string[]
): string | null {
  const match = bestCompanyMatch(query, brands, (b) => b);
  return match?.item ?? null;
}
