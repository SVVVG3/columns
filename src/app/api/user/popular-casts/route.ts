import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { buildProfilePopularCastsResponse } from "@/lib/feedResponse";
import { filterRootCasts } from "@/lib/castFilters";
import { apiErrorFromHypersnap, hsnap } from "@/lib/hypersnap";
import { withCache } from "@/lib/feedCache";

const TTL = 60_000;
const DEFAULT_LIMIT = 10;

interface PopularFeedResponse {
  casts: Record<string, unknown>[];
}

export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const fid = Number(searchParams.get("fid"));
  if (!Number.isFinite(fid) || fid <= 0) {
    return NextResponse.json({ error: "fid required" }, { status: 400 });
  }

  const limit = Math.min(
    Math.max(Number(searchParams.get("limit")) || DEFAULT_LIMIT, 1),
    10
  );
  const viewerFid = session.user.fid;
  const cacheKey = `popular:${fid}:${limit}`;

  try {
    const data = await withCache(cacheKey, TTL, () =>
      hsnap<PopularFeedResponse>("/v2/farcaster/feed/user/popular", { fid, limit })
    );
    const roots = filterRootCasts(data.casts ?? []);
    const casts = await buildProfilePopularCastsResponse(roots, viewerFid);
    return NextResponse.json({ casts });
  } catch (err: unknown) {
    return apiErrorFromHypersnap(err, "[/api/user/popular-casts]");
  }
}
