import { requireAuth } from "@/lib/auth";
import { generateWeeklyDraft } from "@/lib/claude";
import { fetchActivities } from "@/lib/outreach-sheets";
import { NextResponse } from "next/server";

export const maxDuration = 60;

function weekStartDate(): Date {
  const now = new Date();
  const day = now.getDay();
  const diff = day === 0 ? 6 : day - 1;
  const monday = new Date(now);
  monday.setDate(now.getDate() - diff);
  monday.setHours(0, 0, 0, 0);
  return monday;
}

function formatWeekLabel(start: Date): string {
  const end = new Date(start);
  end.setDate(start.getDate() + 6);
  const fmt = (d: Date) =>
    d.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
  return `${fmt(start)} – ${fmt(end)}`;
}

export async function POST(req: Request) {
  try {
    await requireAuth();
    const body = await req.json().catch(() => ({}));
    const customSince = (body as { since?: string }).since;

    const since = customSince || weekStartDate().toISOString().slice(0, 10);
    const activities = await fetchActivities({ since });
    const weekLabel = formatWeekLabel(new Date(since));

    const draft = await generateWeeklyDraft(activities, weekLabel);
    return NextResponse.json({ draft, activityCount: activities.length, since, weekLabel });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Weekly draft failed";
    const status = message === "Unauthorized" ? 401 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
