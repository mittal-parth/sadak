import { NextResponse } from "next/server";
import { fileVisit } from "@/roznamcha/lib/store/store";
import { FIELD_LABELS } from "@/roznamcha/lib/types";
import { getPostHogClient } from "@/lib/posthog-server";

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

  const posthog = getPostHogClient();
  posthog.capture({
    distinctId: result.record.workerId,
    event: "roz_visit_record_filed",
    properties: {
      visit_ref: result.record.ref,
      household_id: result.record.householdId,
      language: result.record.language,
      fields_filled: Object.keys(result.record.fields ?? {}).length,
      corrections_made: result.record.corrections?.length ?? 0,
    },
  });
  await posthog.flush();

  return NextResponse.json({ record: result.record, summary: result.summary });
}
