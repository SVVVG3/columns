import { NextRequest, NextResponse } from "next/server";
import { apiErrorFromHypersnap } from "@/lib/hypersnap";
import {
  fetchPublicProfileByFid,
  fetchPublicProfileByUsername,
} from "@/lib/fetchPublicProfile";

/** GET /api/profile/public?username= | ?fid= — public profile read (mini app shares). */
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const fidParam = searchParams.get("fid");
  const usernameParam = searchParams.get("username")?.replace(/^@/, "").trim();

  if (!fidParam && !usernameParam) {
    return NextResponse.json({ error: "fid or username required" }, { status: 400 });
  }

  try {
    if (fidParam) {
      const fid = parseInt(fidParam, 10);
      if (Number.isNaN(fid)) {
        return NextResponse.json({ error: "invalid fid" }, { status: 400 });
      }
      const user = await fetchPublicProfileByFid(fid);
      if (!user) {
        return NextResponse.json({ error: "User not found" }, { status: 404 });
      }
      return NextResponse.json({ user });
    }

    const user = await fetchPublicProfileByUsername(usernameParam!);
    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }
    return NextResponse.json({ user });
  } catch (err: unknown) {
    return apiErrorFromHypersnap(err, "[/api/profile/public]");
  }
}
