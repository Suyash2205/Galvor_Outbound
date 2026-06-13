import type { EmailContent } from "./types";
import type { JobPhase } from "./lead-job";
import { SendCancelledError } from "./send-cancelled";

export { SendCancelledError };

export interface JobPollResult {
  phase: JobPhase;
  message: string;
  email?: EmailContent;
}

export function phaseToProgress(phase: JobPhase | "sending" | "cancelled" | "completed"): number {
  switch (phase) {
    case "scraping":
      return 30;
    case "fetching":
      return 55;
    case "analyzing":
      return 75;
    case "sending":
      return 90;
    case "completed":
      return 100;
    case "cancelled":
      return 100;
    case "ready":
      return 100;
    default:
      return 15;
  }
}

export async function runLeadJobUntilReady(
  rowIndex: number,
  onProgress?: (message: string, phase: JobPhase) => void,
  options?: { shouldCancel?: () => boolean }
): Promise<EmailContent> {
  const shouldCancel = options?.shouldCancel;

  const startRes = await fetch(`/api/leads/${rowIndex}/job`, { method: "POST" });
  const startData = await startRes.json();
  if (!startRes.ok) throw new Error(startData.error || "Failed to start job");

  if (shouldCancel?.()) throw new SendCancelledError();

  if (startData.phase === "ready" && startData.email) {
    return startData.email;
  }

  onProgress?.(startData.message || "Working…", startData.phase);

  const maxAttempts = 50;
  for (let i = 0; i < maxAttempts; i++) {
    await sleep(8000, shouldCancel);

    const pollRes = await fetch(`/api/leads/${rowIndex}/job`);
    const pollData = await pollRes.json();
    if (!pollRes.ok) throw new Error(pollData.error || "Job poll failed");

    if (shouldCancel?.()) throw new SendCancelledError();

    onProgress?.(pollData.message || "Working…", pollData.phase);

    if (pollData.phase === "ready" && pollData.email) {
      return pollData.email;
    }
    if (pollData.phase === "error") {
      throw new Error(pollData.message || "Generation failed");
    }
  }

  throw new Error("Timed out after 6 minutes. Try again or check the Ad Library URL.");
}

async function sleep(ms: number, shouldCancel?: () => boolean) {
  const step = 400;
  for (let elapsed = 0; elapsed < ms; elapsed += step) {
    if (shouldCancel?.()) throw new SendCancelledError();
    await new Promise((r) => setTimeout(r, Math.min(step, ms - elapsed)));
  }
}
