import { NextRequest, NextResponse } from "next/server";
import { withCache } from "@/lib/feedCache";
import { paginateNewsArticles, assertPublicFeedUrl, fetchRssFeedArticles } from "@/lib/rssFeed";
import { getSession } from "@/lib/session";

const TTL = 120_000;

export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const rawUrl = searchParams.get("url")?.trim();
  if (!rawUrl) {
    return NextResponse.json({ error: "url required" }, { status: 400 });
  }

  const cursor = searchParams.get("cursor") ?? undefined;
  const limit = Math.min(Math.max(Number(searchParams.get("limit")) || 20, 1), 50);

  try {
    const feedUrl = assertPublicFeedUrl(rawUrl);
    const cacheKey = `rss:${feedUrl.toString()}`;

    const articles = await withCache(cacheKey, TTL, () =>
      fetchRssFeedArticles(feedUrl.toString())
    );

    const page = paginateNewsArticles(articles, { limit, cursor });
    return NextResponse.json(page);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "RSS feed failed";
    console.error("[/api/feed/rss]", message);
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
