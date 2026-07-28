import { NextResponse } from "next/server";
import { loadDistrictById } from "@/lib/game/load-district";

export const runtime = "nodejs";

type Params = { params: Promise<{ id: string }> };

export async function GET(_req: Request, { params }: Params) {
  const { id } = await params;
  try {
    const loaded = await loadDistrictById(id);
    if (!loaded) {
      return NextResponse.json({ error: "District not found." }, { status: 404 });
    }
    return NextResponse.json({
      id: loaded.id,
      district: loaded.district,
      taskPack: loaded.taskPack,
      tasks: loaded.tasks,
    });
  } catch (err) {
    console.error("GET /api/districts/[id]", id, err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to load district." },
      { status: 502 },
    );
  }
}
