import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { withCacheFresh } from "@/lib/feedCache";
import { buildFeedCastsResponse } from "@/lib/feedResponse";
import { clampPageSize, fetchKeywordRootCastPage } from "@/lib/feedPagination";
import { apiErrorFromHypersnap } from "@/lib/hypersnap";

const TTL = 45_000;

export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const queriesParam = searchParams.get("queries") ?? searchParams.get("query");
  const cursor = searchParams.get("cursor") ?? undefined;
  const pageSize = clampPageSize(Number(searchParams.get("limit")));
  const fresh = searchParams.get("fresh") === "1" && !cursor;

  if (!queriesParam) {
    return NextResponse.json({ error: "query or queries required" }, { status: 400 });
  }

  const queries = queriesParam.split(",").map((q) => q.trim()).filter(Boolean);
  const fid = session.user.fid;
  const cacheKey = `keyword:${queriesParam}:${cursor ?? ""}:${pageSize}`;

  try {
    const feedData = await withCacheFresh(cacheKey, TTL, fresh, () =>
      fetchKeywordRootCastPage(queries, cursor, pageSize)
    );

    const casts = await buildFeedCastsResponse(feedData.casts ?? [], fid);

    return NextResponse.json({
      ...feedData,
      casts,
    });
  } catch (err: unknown) {
    return apiErrorFromHypersnap(err, "[/api/feed/keyword]");
  }
}
