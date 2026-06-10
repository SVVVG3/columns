import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { searchUsersProfile } from "@/lib/userSearch";
import { apiErrorFromHypersnap } from "@/lib/hypersnap";

const LIMIT = 25;

export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  // Profile-only mini app users may search to edit Top 8.

  const { searchParams } = new URL(req.url);
  const q = searchParams.get("q")?.trim();

  if (!q) {
    return NextResponse.json({ users: [] });
  }

  try {
    const users = await searchUsersProfile(q, LIMIT, session.user.fid);
    return NextResponse.json({ users });
  } catch (err: unknown) {
    return apiErrorFromHypersnap(err, "[/api/user/search]");
  }
}
