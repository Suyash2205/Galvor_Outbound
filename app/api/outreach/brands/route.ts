import { requireAuth } from "@/lib/auth";
import { appendTrackerBrand, fetchTrackerBrands } from "@/lib/outreach-sheets";
import { NextResponse } from "next/server";

export async function GET() {
  try {
    await requireAuth();
    const brands = await fetchTrackerBrands();
    return NextResponse.json({ brands });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to load brands";
    const status = message === "Unauthorized" ? 401 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}

export async function POST(req: Request) {
  try {
    await requireAuth();
    const body = await req.json();
    const { brand, category, firstName, lastName, source, owner } = body as {
      brand?: string;
      category?: string;
      firstName?: string;
      lastName?: string;
      source?: string;
      owner?: string;
    };

    if (!brand?.trim()) {
      return NextResponse.json({ error: "Company / Brand is required." }, { status: 400 });
    }

    const created = await appendTrackerBrand({
      brand: brand.trim(),
      category: category?.trim() || "",
      firstName: firstName?.trim() || "",
      lastName: lastName?.trim() || "",
      source: source?.trim() || "",
      owner: owner?.trim() || "",
    });

    const brands = await fetchTrackerBrands();
    return NextResponse.json({ brand: created, brands });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to add brand";
    const status = message === "Unauthorized" ? 401 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
