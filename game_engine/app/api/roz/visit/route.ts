import { NextResponse } from "next/server";
import { createVisit, getHousehold } from "@/roznamcha/lib/store/store";
import type { LangCode } from "@/roznamcha/lib/types";

export const runtime = "nodejs";

/** Opens a new draft visit against a household. */
export async function POST(req: Request) {
  let body: { householdId?: string; workerId?: string; language?: LangCode };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid JSON body" }, { status: 400 });
  }

  const householdId = body.householdId;
  if (!householdId) {
    return NextResponse.json({ error: "householdId is required" }, { status: 400 });
  }
  if (!getHousehold(householdId)) {
    return NextResponse.json(
      { error: `unknown household: ${householdId}` },
      { status: 404 }
    );
  }

  const record = createVisit(
    householdId,
    body.workerId ?? "asha-demo",
    body.language ?? "hi-IN"
  );

  return NextResponse.json({ record });
}
