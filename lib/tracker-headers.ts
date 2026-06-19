/** Column I (0-based index 8) — historical notes before Activity Log */
export const TRACKER_LEGACY_COLUMN_INDEX = 8;

export type TrackerColumnKey =
  | "brand"
  | "category"
  | "firstName"
  | "lastName"
  | "source"
  | "owner"
  | "email"
  | "phone"
  | "legacyComments"
  | "finalStatus"
  | "comments"
  | "emailStatus"
  | "lastEmailDate"
  | "emailOutcome";

const HEADER_ALIASES: Record<TrackerColumnKey, string[]> = {
  brand: ["company / brand", "company", "brand"],
  category: ["category", "industry"],
  firstName: ["first name"],
  lastName: ["last name"],
  source: ["source", "lead source"],
  owner: ["owner"],
  email: ["email address", "email"],
  phone: ["phone number", "phone"],
  legacyComments: ["icp persona"],
  finalStatus: ["final status"],
  comments: ["comments"],
  emailStatus: ["email status"],
  lastEmailDate: ["last email date"],
  emailOutcome: ["email outcome"],
};

export type TrackerColumnMap = Partial<Record<TrackerColumnKey, number>>;

export function buildColumnMap(headerRow: string[]): TrackerColumnMap {
  const map: TrackerColumnMap = {};
  const normalized = headerRow.map((h) => (h || "").trim().toLowerCase());

  for (const [key, aliases] of Object.entries(HEADER_ALIASES) as [
    TrackerColumnKey,
    string[],
  ][]) {
    const idx = normalized.findIndex((h) => aliases.some((a) => h === a || h.includes(a)));
    if (idx >= 0) map[key] = idx;
  }

  // Column I — historical notes (always index 8, per sheet layout)
  map.legacyComments = TRACKER_LEGACY_COLUMN_INDEX;

  return map;
}

export function colLetter(index: number): string {
  let n = index + 1;
  let s = "";
  while (n > 0) {
    const rem = (n - 1) % 26;
    s = String.fromCharCode(65 + rem) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
}

export function getCol(row: string[], map: TrackerColumnMap, key: TrackerColumnKey): string {
  const idx = map[key];
  if (idx === undefined) return "";
  return row[idx]?.trim() || "";
}
