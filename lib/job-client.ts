import type { EmailContent } from "./types";
import type { JobPhase } from "./lead-job";

export interface JobPollResult {
  phase: JobPhase;
  message: string;
  email?: EmailContent;
}

export async function runLeadJobUntilReady(
  rowIndex: number,
  onProgress?: (message: string, phase: JobPhase) => void
): Promise<EmailContent> {
  const startRes = await fetch(`/api/leads/${rowIndex}/job`, { method: "POST" });
  const startData = await startRes.json();
  if (!startRes.ok) throw new Error(startData.error || "Failed to start job");

  if (startData.phase === "ready" && startData.email) {
    return startData.email;
  }

  onProgress?.(startData.message || "Working…", startData.phase);

  const maxAttempts = 90; // ~6 min at 4s intervals
  for (let i = 0; i < maxAttempts; i++) {
    await sleep(4000);
    const pollRes = await fetch(`/api/leads/${rowIndex}/job`);
    const pollData = await pollRes.json();
    if (!pollRes.ok) throw new Error(pollData.error || "Job poll failed");

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

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}
