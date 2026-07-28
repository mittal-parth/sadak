import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import type { ComfortLevel } from "@/lib/game/levels";
import {
  defaultProgress,
  progressToUpsert,
  rowToProgress,
  type DistrictProgress,
  type DistrictProgressRow,
} from "@/lib/game/progress";

export const runtime = "nodejs";

function isComfortLevel(v: string): v is ComfortLevel {
  return v === "easy" || v === "medium" || v === "hard";
}

function parseProgressBody(body: unknown): DistrictProgress | null {
  if (!body || typeof body !== "object") return null;
  const b = body as Record<string, unknown>;
  if (typeof b.districtId !== "string" || !b.districtId.trim()) return null;
  if (typeof b.comfort !== "string" || !isComfortLevel(b.comfort)) return null;
  if (typeof b.cash !== "number" || !Number.isFinite(b.cash)) return null;
  if (typeof b.xp !== "number" || !Number.isFinite(b.xp)) return null;
  if (!Array.isArray(b.completedTaskIds)) return null;
  if (!b.completedTaskIds.every((id) => typeof id === "string")) return null;

  return {
    districtId: b.districtId.trim(),
    comfort: b.comfort,
    cash: Math.max(0, Math.round(b.cash)),
    xp: Math.max(0, Math.round(b.xp)),
    completedTaskIds: b.completedTaskIds,
  };
}

export async function GET(req: Request) {
  const districtId = new URL(req.url).searchParams.get("districtId")?.trim();
  if (!districtId) {
    return NextResponse.json({ error: "districtId is required." }, { status: 400 });
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const { data, error } = await supabase
    .from("district_progress")
    .select("*")
    .eq("user_id", user.id)
    .eq("district_id", districtId)
    .maybeSingle();

  if (error) {
    console.error("GET /api/progress", error);
    return NextResponse.json({ error: "Failed to load progress." }, { status: 502 });
  }

  const progress = data
    ? rowToProgress(data as DistrictProgressRow)
    : defaultProgress(districtId);

  return NextResponse.json({ progress });
}

export async function PUT(req: Request) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid JSON body" }, { status: 400 });
  }

  const progress = parseProgressBody(body);
  if (!progress) {
    return NextResponse.json({ error: "Invalid progress payload." }, { status: 400 });
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const row = progressToUpsert(user.id, progress);
  const { data, error } = await supabase
    .from("district_progress")
    .upsert(row, { onConflict: "user_id,district_id" })
    .select("*")
    .single();

  if (error) {
    console.error("PUT /api/progress", error);
    return NextResponse.json({ error: "Failed to save progress." }, { status: 502 });
  }

  return NextResponse.json({ progress: rowToProgress(data as DistrictProgressRow) });
}
