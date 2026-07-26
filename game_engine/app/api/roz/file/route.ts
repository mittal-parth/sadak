import { NextResponse } from "next/server";
import { fileVisit } from "@/roznamcha/lib/store/store";
import { FIELD_LABELS } from "@/roznamcha/lib/types";

export const runtime = "nodejs";

type Body = { ref: string };

export async function POST(req: Request) {
  let body: Body;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid JSON body" }, { status: 400 });
  }

  const { ref } = body ?? ({} as Body);
  if (!ref || typeof ref !== "string") {
    return NextResponse.json({ error: "ref is required" }, { status: 400 });
  }

  let result;
  try {
    result = fileVisit(ref);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 404 }
    );
  }

  if (!result.ok) {
    return NextResponse.json(
      {
        error: "missing required fields",
        missing: result.missing,
        missingLabels: result.missing.map((f) => FIELD_LABELS[f]),
      },
      { status: 422 }
    );
  }

  return NextResponse.json({ record: result.record, summary: result.summary });
}
