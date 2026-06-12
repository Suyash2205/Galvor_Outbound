import { checkThreadForReply } from "./gmail";
import { fetchAllLeads, updateLeadRow } from "./sheets";
import type { Lead } from "./types";

export async function checkRepliesForAllLeads(params: {
  accessToken: string;
  senderEmail: string;
}): Promise<{ checked: number; moved: number }> {
  const leads = await fetchAllLeads();
  const active = leads.filter(
    (l) =>
      l.stage !== "Response Received" &&
      l.gmailThreadId &&
      l.email &&
      !l.respondedAt
  );

  let moved = 0;

  for (const lead of active) {
    const afterTs = getLastSentTimestamp(lead);
    const hasReply = await checkThreadForReply({
      accessToken: params.accessToken,
      threadId: lead.gmailThreadId,
      leadEmail: lead.email,
      senderEmail: params.senderEmail,
      afterTimestamp: afterTs,
    });

    if (hasReply) {
      await updateLeadRow(lead.rowIndex, {
        stage: "Response Received",
        status: "responded",
        respondedAt: new Date().toISOString(),
        errorMessage: "",
      });
      moved++;
    }
  }

  return { checked: active.length, moved };
}

function getLastSentTimestamp(lead: Lead): number | undefined {
  const dates = [
    lead.email6SentAt,
    lead.email5SentAt,
    lead.email4SentAt,
    lead.email3SentAt,
    lead.email2SentAt,
    lead.email1SentAt,
  ].filter(Boolean);

  if (!dates.length) return undefined;
  return Math.max(...dates.map((d) => new Date(d).getTime()));
}
