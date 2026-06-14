import { requireAuth } from "@/lib/auth";
import { polishActivityComment } from "@/lib/claude";
import { NextResponse } from "next/server";

export const maxDuration = 60;

export async function POST(req: Request) {
  try {
    await requireAuth();
    const body = await req.json();
    const { brand, category, comments } = body as {
      brand?: string;
      category?: string;
      comments?: string;
    };

    if (!brand?.trim() || !category?.trim() || !comments?.trim()) {
      return NextResponse.json({ error: "Brand, category, and comments are required." }, { status: 400 });
    }

    const polished = await polishActivityComment(brand.trim(), category.trim(), comments.trim());
    return NextResponse.json({ polished });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Polish failed";
    const status = message === "Unauthorized" ? 401 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
