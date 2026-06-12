const APIFY_ACTOR = "apify~facebook-ads-scraper";

export interface ProcessedAd {
  title: string;
  format: string;
  active: boolean;
  ageDays: number;
  platforms: string[];
}

export interface ApifyRunRef {
  runId: string;
  datasetId: string;
}

const JOB_PREFIX = "APIFY_JOB:";

export function encodeApifyJob(ref: ApifyRunRef): string {
  return `${JOB_PREFIX}${JSON.stringify(ref)}`;
}

export function decodeApifyJob(notes: string): ApifyRunRef | null {
  if (!notes?.startsWith(JOB_PREFIX)) return null;
  try {
    return JSON.parse(notes.slice(JOB_PREFIX.length)) as ApifyRunRef;
  } catch {
    return null;
  }
}

export function processApifyItems(items: Record<string, unknown>[]): ProcessedAd[] {
  const today = new Date();
  return items
    .map((item) => {
      const startStr =
        (item.startDateFormatted as string) ?? (item["startDateFormatted"] as string);
      const start = startStr ? new Date(startStr) : null;
      if (!start || isNaN(start.getTime())) return null;

      const ageDays = Math.max(0, Math.floor((today.getTime() - start.getTime()) / 86400000));

      const snapshot = item.snapshot as Record<string, unknown> | undefined;
      const title = (snapshot?.title as string) ?? (item["snapshot.title"] as string) ?? "";
      const format =
        (snapshot?.displayFormat as string) ??
        (item["snapshot.displayFormat"] as string) ??
        "";
      const active = item.isActive === true || item.isActive === "true";

      const platforms = Array.isArray(item.publisherPlatform)
        ? (item.publisherPlatform as string[])
        : ["publisherPlatform/0", "publisherPlatform/1", "publisherPlatform/2", "publisherPlatform/3", "publisherPlatform/4"]
            .map((k) => item[k] as string)
            .filter(Boolean);

      const cleanTitle = String(title)
        .replace(/\{\{[^}]*\}\}/g, "")
        .replace(/\s+/g, " ")
        .trim();

      const displayTitle =
        cleanTitle ||
        (format === "DCO" ? "Catalog/DPA ad (dynamic product feed)" : `${format || "Ad"}`);

      return { title: displayTitle, format, active, ageDays, platforms };
    })
    .filter((x): x is ProcessedAd => x !== null);
}

function getApiKey() {
  const apiKey = process.env.APIFY_API_KEY;
  if (!apiKey) throw new Error("APIFY_API_KEY is not configured.");
  return apiKey;
}

export async function startApifyRun(adLibraryUrl: string): Promise<ApifyRunRef> {
  const apiKey = getApiKey();
  const params = new URLSearchParams({ token: apiKey, maxItems: "200" });
  const startRes = await fetch(
    `https://api.apify.com/v2/acts/${APIFY_ACTOR}/runs?${params}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ startUrls: [{ url: adLibraryUrl }], resultsLimit: 200 }),
    }
  );

  if (!startRes.ok) {
    const err = await startRes.json().catch(() => ({}));
    const msg = (err as { error?: { message?: string } })?.error?.message || "";
    if (startRes.status === 401) throw new Error("Invalid Apify API key.");
    throw new Error(`Apify start error ${startRes.status}${msg ? `: ${msg}` : ""}`);
  }

  const { data: run } = await startRes.json();
  return { runId: run.id, datasetId: run.defaultDatasetId };
}

export async function checkApifyRun(runId: string): Promise<{
  status: string;
  datasetId?: string;
}> {
  const apiKey = getApiKey();
  const res = await fetch(`https://api.apify.com/v2/actor-runs/${runId}?token=${apiKey}`);
  if (!res.ok) throw new Error(`Failed to check Apify run (${res.status})`);
  const { data } = await res.json();
  return { status: data.status, datasetId: data.defaultDatasetId };
}

export async function fetchApifyDataset(datasetId: string): Promise<Record<string, unknown>[]> {
  const apiKey = getApiKey();
  const dataRes = await fetch(
    `https://api.apify.com/v2/datasets/${datasetId}/items?token=${apiKey}&format=json&clean=true`
  );
  if (!dataRes.ok) throw new Error(`Failed to fetch Apify results (${dataRes.status})`);
  return dataRes.json();
}
