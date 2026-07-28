import { NextResponse } from "next/server";
import { listDistricts } from "@/lib/game/load-district";

export const runtime = "nodejs";

export async function GET() {
  try {
    const districts = await listDistricts();
    return NextResponse.json({ districts });
  } catch (err) {
    console.error("GET /api/districts", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to load districts." },
      { status: 502 },
    );
  }
}
