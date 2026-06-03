import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { searchUsersCombined } from "@/lib/userSearch";

const LIMIT = 25;

export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const q = searchParams.get("q")?.trim();

  if (!q) {
    return NextResponse.json({ users: [] });
  }

  try {
    const users = await searchUsersCombined(q, LIMIT);
    return NextResponse.json({ users });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[/api/user/search]", msg);
    return NextResponse.json({ error: msg }, { status: 502 });
  }
}
