import { requireAuth } from "@/lib/auth";
import {
  addActivityCategory,
  fetchActivityCategories,
} from "@/lib/outreach-categories";
import { addIndustryCategory, fetchIndustryCategories } from "@/lib/outreach-sheets";
import { NextResponse } from "next/server";

export async function GET() {
  try {
    await requireAuth();
    const [activity, industry] = await Promise.all([
      fetchActivityCategories(),
      fetchIndustryCategories(),
    ]);
    return NextResponse.json({ activity, industry });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to load categories";
    const status = message === "Unauthorized" ? 401 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}

export async function POST(req: Request) {
  try {
    await requireAuth();
    const body = await req.json();
    const { type, name } = body as { type?: "activity" | "industry"; name?: string };

    if (!name?.trim()) {
      return NextResponse.json({ error: "Category name is required." }, { status: 400 });
    }
    if (type !== "activity" && type !== "industry") {
      return NextResponse.json({ error: "Invalid category type." }, { status: 400 });
    }

    const categories =
      type === "activity"
        ? await addActivityCategory(name.trim())
        : await addIndustryCategory(name.trim());

    return NextResponse.json({ categories, type });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to add category";
    const status = message === "Unauthorized" ? 401 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
