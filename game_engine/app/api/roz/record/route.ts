import { NextResponse } from "next/server";
import { getVisit } from "@/roznamcha/lib/store/store";

export const runtime = "nodejs";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const ref = searchParams.get("ref");
  if (!ref) {
    return NextResponse.json({ error: "ref query param is required" }, { status: 400 });
  }

  const record = getVisit(ref);
  if (!record) {
    return NextResponse.json({ error: `unknown ref: ${ref}` }, { status: 404 });
  }

  return NextResponse.json({ record });
}
