import { requireAuth } from "@/lib/auth";
import { appendActivity, fetchActivities } from "@/lib/outreach-sheets";
import { OUTREACH_CATEGORIES, type OutreachCategory } from "@/lib/types";
import { NextResponse } from "next/server";

export async function GET(req: Request) {
  try {
    await requireAuth();
    const url = new URL(req.url);
    const since = url.searchParams.get("since") || undefined;
    const limit = url.searchParams.get("limit")
      ? parseInt(url.searchParams.get("limit")!, 10)
      : undefined;

    const activities = await fetchActivities({ since, limit });
    return NextResponse.json({ activities });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to load activities";
    const status = message === "Unauthorized" ? 401 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}

export async function POST(req: Request) {
  try {
    const session = await requireAuth();
    const body = await req.json();
    const { activityDate, brand, category, comments, polishedComment } = body as {
      activityDate?: string;
      brand?: string;
      category?: OutreachCategory;
      comments?: string;
      polishedComment?: string;
    };

    if (!activityDate?.trim()) {
      return NextResponse.json({ error: "Activity date is required." }, { status: 400 });
    }
    if (!brand?.trim()) {
      return NextResponse.json({ error: "Brand is required." }, { status: 400 });
    }
    if (!category || !OUTREACH_CATEGORIES.includes(category)) {
      return NextResponse.json({ error: "Valid category is required." }, { status: 400 });
    }
    if (!comments?.trim()) {
      return NextResponse.json({ error: "Comments are required." }, { status: 400 });
    }

    const activity = await appendActivity({
      activityDate: activityDate.trim(),
      brand: brand.trim(),
      category,
      comments: comments.trim(),
      polishedComment: polishedComment?.trim(),
      loggedBy: session.user!.email!,
    });

    return NextResponse.json({ activity });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to save activity";
    const status = message === "Unauthorized" ? 401 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
