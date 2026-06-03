import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { withCache } from "@/lib/feedCache";
import { buildFeedCastsResponse } from "@/lib/feedResponse";
import { clampPageSize, fetchRootCastFeedPage } from "@/lib/feedPagination";

const TTL = 45_000;

export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const cursor = searchParams.get("cursor") ?? undefined;
  const pageSize = clampPageSize(Number(searchParams.get("limit")));
  const fid = session.user.fid;
  const cacheKey = `trending:${cursor ?? ""}:${pageSize}`;

  const feedData = await withCache(cacheKey, TTL, () =>
    fetchRootCastFeedPage("/v2/farcaster/feed/trending", { cursor }, pageSize)
  );

  const casts = await buildFeedCastsResponse(feedData.casts ?? [], fid);

  return NextResponse.json({
    ...feedData,
    casts,
  });
}
