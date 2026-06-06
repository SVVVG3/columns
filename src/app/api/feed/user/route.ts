import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { withCacheFresh } from "@/lib/feedCache";
import { buildFeedCastsResponse } from "@/lib/feedResponse";
import {
  clampPageSize,
  fetchMultiUserRootCastPage,
  fetchRootCastFeedPage,
} from "@/lib/feedPagination";
import { apiErrorFromHypersnap } from "@/lib/hypersnap";

const TTL = 45_000;

export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const cursor = searchParams.get("cursor") ?? undefined;
  const pageSize = clampPageSize(Number(searchParams.get("limit")));
  const fresh = searchParams.get("fresh") === "1" && !cursor;

  const fidsParam = searchParams.get("fids") ?? searchParams.get("fid");
  if (!fidsParam) {
    return NextResponse.json({ error: "fid or fids required" }, { status: 400 });
  }
  const fids = fidsParam.split(",").map(Number).filter(Boolean);
  if (fids.length === 0) {
    return NextResponse.json({ error: "invalid fid" }, { status: 400 });
  }

  const viewerFid = session.user.fid;
  const cacheKey = `user:root:${fidsParam}:${cursor ?? ""}:${pageSize}`;

  try {
    const feedData = await withCacheFresh(cacheKey, TTL, fresh, async () => {
      if (fids.length === 1) {
        return fetchRootCastFeedPage(
          "/v2/farcaster/feed/user/casts",
          { fid: fids[0], cursor },
          pageSize
        );
      }
      return fetchMultiUserRootCastPage(fids, cursor, pageSize);
    });

    const casts = await buildFeedCastsResponse(feedData.casts ?? [], viewerFid);

    return NextResponse.json({
      ...feedData,
      casts,
    });
  } catch (err: unknown) {
    return apiErrorFromHypersnap(err, "[/api/feed/user]");
  }
}
