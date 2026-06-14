export function normalizeCronSecret(value: string | null | undefined): string {
  return (value || "").trim().replace(/:+$/, "");
}

export function isAuthorizedCronRequest(req: Request): boolean {
  const cronSecret = normalizeCronSecret(process.env.CRON_SECRET);
  if (!cronSecret) return true;

  const url = new URL(req.url);
  const candidates = [
    req.headers.get("authorization"),
    req.headers.get("x-cron-secret"),
    url.searchParams.get("secret"),
  ]
    .map(normalizeCronSecret)
    .filter(Boolean);

  for (const candidate of candidates) {
    if (candidate === cronSecret) return true;
    if (candidate === `Bearer ${cronSecret}`) return true;
    if (candidate.startsWith("Bearer ") && candidate.slice(7) === cronSecret) return true;
  }

  return false;
}
