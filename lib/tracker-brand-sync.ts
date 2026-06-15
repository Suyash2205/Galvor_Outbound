import { bestCompanyMatch, companyMatchScore } from "./company-match";
import { derivePipelineEmailFields } from "./outreach-sync";
import { fetchAllLeads } from "./sheets";
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

/** Sheet column L — one comment per line */
export function buildCommentsText(brandActivities: OutreachActivity[]): string {
  return buildCommentThread(brandActivities)
    .map((c) => (c.date ? `${c.date} - ${c.text}` : c.text))
    .join("\n");
}

export function deriveFinalStatus(
  brand: string,
  activities: OutreachActivity[],
  pipelineLeads: Lead[]
): string {
  const brandActivities = activitiesForBrand(brand, activities);
  if (brandActivities.length > 0) return "Active lead";

  const brandLeads = leadsForBrand(brand, pipelineLeads);
  if (!brandLeads.length) return "";

  const hasResponse = brandLeads.some(
    (l) =>
      Boolean(l.respondedAt?.trim()) ||
      l.stage === "Response Received" ||
      l.status === "responded"
  );
  if (hasResponse) return "Response received but no work done";

  let maxEmail = 0;
  for (const lead of brandLeads) {
    const fields = derivePipelineEmailFields(lead);
    const match = fields.emailStatus.match(/Email (\d+) Sent/i);
    if (match) maxEmail = Math.max(maxEmail, parseInt(match[1], 10));
  }

  if (maxEmail <= 0) return "";
  if (maxEmail === 1) return "Only Outbound email Sent with no Response";
  const ord = ORDINALS[maxEmail] || `${maxEmail}th`;
  return `${ord} email sent`;
}

export function classifyFinalStatus(finalStatus: string): BrandTrackerView["statusCategory"] {
  const s = finalStatus.toLowerCase();
  if (!s) return "empty";
  if (s.includes("active lead") || s.includes("active client")) return "active";
  if (s.includes("response received but no work")) return "response_no_work";
  if (s.includes("email sent") || s.includes("outbound email")) return "email_only";
  return "other";
}

export function buildBrandTrackerViews(
  trackerRows: Awaited<ReturnType<typeof fetchBrandTrackerRows>>,
  activities: OutreachActivity[],
  pipelineLeads: Lead[]
): BrandTrackerView[] {
  const byBrand = new Map<string, BrandTrackerView>();

  for (const row of trackerRows) {
    const key = row.brand.trim();
    if (!key) continue;

    const existing = byBrand.get(key);
    if (!existing) {
      const brandActivities = activitiesForBrand(key, activities);
      const finalStatus = deriveFinalStatus(key, activities, pipelineLeads);
      const commentThread = buildCommentThread(brandActivities);
      const comments = buildCommentsText(brandActivities);
      const lastActivity = brandActivities[brandActivities.length - 1];

      byBrand.set(key, {
        brand: key,
        industry: row.industry,
        finalStatus,
        comments,
        commentThread,
        latestComment: commentThread.length ? commentThread[commentThread.length - 1] : null,
        lastActivityDate: lastActivity
          ? lastActivity.activityDate || lastActivity.loggedAt.slice(0, 10)
          : "",
        rowIndices: [row.rowIndex],
        hasActivityLog: brandActivities.length > 0,
        statusCategory: classifyFinalStatus(finalStatus),
      });
    } else {
      if (!existing.industry && row.industry) existing.industry = row.industry;
      existing.rowIndices.push(row.rowIndex);
    }
  }

  return [...byBrand.values()].sort((a, b) =>
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
  for (const view of targetBrands) {
    for (const rowIndex of view.rowIndices) {
      updates.push({
        rowIndex,
        finalStatus: view.finalStatus,
        comments: view.comments,
      });
    }
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
