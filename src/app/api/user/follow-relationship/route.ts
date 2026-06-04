import { NextRequest, NextResponse } from "next/server";
import { getFollowRelationship } from "@/lib/followCheck";
import { withCache } from "@/lib/feedCache";
import { apiErrorFromHypersnap } from "@/lib/hypersnap";
import { getSession } from "@/lib/session";

const TTL = 60_000;

export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const fidParam = new URL(req.url).searchParams.get("fid");
  if (!fidParam) {
    return NextResponse.json({ error: "fid required" }, { status: 400 });
  }

  const targetFid = parseInt(fidParam, 10);
  if (Number.isNaN(targetFid)) {
    return NextResponse.json({ error: "invalid fid" }, { status: 400 });
  }

  const viewerFid = session.user.fid;
  if (targetFid === viewerFid) {
    return NextResponse.json({
      viewerFollowsUser: false,
      userFollowsViewer: false,
      self: true,
    });
  }

  const cacheKey = `follow-rel:${viewerFid}:${targetFid}`;

  try {
    const relationship = await withCache(cacheKey, TTL, () =>
      getFollowRelationship(viewerFid, targetFid)
    );
    return NextResponse.json(relationship);
  } catch (err: unknown) {
    return apiErrorFromHypersnap(err, "[/api/user/follow-relationship]");
  }
}
