import { NextResponse } from "next/server";
import { getHousehold, listVisits } from "@/roznamcha/lib/store/store";

export const runtime = "nodejs";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const id = searchParams.get("id");
  if (!id) {
    return NextResponse.json({ error: "id query param is required" }, { status: 400 });
  }

  const household = getHousehold(id);
  if (!household) {
    return NextResponse.json({ error: `unknown household: ${id}` }, { status: 404 });
  }

  const visits = listVisits(id);

  return NextResponse.json({ household, visits });
}
