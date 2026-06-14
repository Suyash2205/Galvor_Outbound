const STRIP_SUFFIXES =
  /\b(pvt|ltd|limited|inc|llc|corp|corporation|co|company|group|holdings|india|international|global|design|skincare|beauty|pharma|apparels|apparel)\b/gi;

export function normalizeCompanyName(name: string): string {
  return name
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(STRIP_SUFFIXES, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function tokenSet(name: string): Set<string> {
  const norm = normalizeCompanyName(name);
  return new Set(norm.split(" ").filter((t) => t.length > 1));
}

function levenshtein(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  if (m === 0) return n;
  if (n === 0) return m;
  const dp = Array.from({ length: m + 1 }, () => new Array<number>(n + 1).fill(0));
  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + cost);
    }
  }
  return dp[m][n];
}

export function companyMatchScore(a: string, b: string): number {
  const na = normalizeCompanyName(a);
  const nb = normalizeCompanyName(b);
  if (!na || !nb) return 0;
  if (na === nb) return 1;
  if (na.includes(nb) || nb.includes(na)) return 0.92;

  const ta = tokenSet(a);
  const tb = tokenSet(b);
  if (ta.size && tb.size) {
    let overlap = 0;
    for (const t of ta) {
      if (tb.has(t)) overlap++;
    }
    const union = new Set([...ta, ...tb]).size;
    const jaccard = overlap / union;
    if (jaccard >= 0.5) return 0.75 + jaccard * 0.2;
    if (overlap >= 1 && (ta.size === 1 || tb.size === 1)) return 0.7;
  }

  const maxLen = Math.max(na.length, nb.length);
  if (maxLen === 0) return 0;
  const dist = levenshtein(na, nb);
  const ratio = 1 - dist / maxLen;
  return ratio >= 0.82 ? ratio * 0.85 : 0;
}

export function bestCompanyMatch<T>(
  query: string,
  candidates: T[],
  getName: (item: T) => string,
  minScore = 0.68
): { item: T; score: number } | null {
  let best: { item: T; score: number } | null = null;
  for (const item of candidates) {
    const score = companyMatchScore(query, getName(item));
    if (score >= minScore && (!best || score > best.score)) {
      best = { item, score };
    }
  }
  return best;
}

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}
