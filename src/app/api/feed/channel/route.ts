import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { withCacheFresh } from "@/lib/feedCache";
import { buildFeedCastsResponse } from "@/lib/feedResponse";
import { clampPageSize, fetchRootCastFeedPage } from "@/lib/feedPagination";
import { apiErrorFromHypersnap } from "@/lib/hypersnap";

const TTL = 45_000;

export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const channelIds = searchParams.get("channelIds");
  const cursor = searchParams.get("cursor") ?? undefined;
  const pageSize = clampPageSize(Number(searchParams.get("limit")));
  const fresh = searchParams.get("fresh") === "1" && !cursor;

  if (!channelIds) {
    return NextResponse.json({ error: "channelIds required" }, { status: 400 });
  }

  const fid = session.user.fid;
  const cacheKey = `channel:${channelIds}:${cursor ?? ""}:${pageSize}`;

  try {
    const feedData = await withCacheFresh(cacheKey, TTL, fresh, () =>
      fetchRootCastFeedPage(
        "/v2/farcaster/feed/channels",
        { channel_ids: channelIds, cursor },
        pageSize
      )
    );

    const casts = await buildFeedCastsResponse(feedData.casts ?? [], fid);

    return NextResponse.json({
      ...feedData,
      casts,
    });
  } catch (err: unknown) {
    return apiErrorFromHypersnap(err, "[/api/feed/channel]");
  }
}
