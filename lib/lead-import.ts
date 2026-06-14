import type { Lead } from "./types";

/** Leads at stage 2–6 without cached_analysis need Email 1 import instead of re-scraping */
export function needsEmail1Import(lead: Lead): boolean {
  if (lead.cachedAnalysis) return false;
  if (lead.stage === "Response Received" || lead.stage === "1") return false;
  const stageNum = parseInt(lead.stage, 10);
  return stageNum >= 2 && stageNum <= 6;
}
