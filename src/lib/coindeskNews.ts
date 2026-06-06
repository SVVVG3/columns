/**
 * CoinDesk Data API — news article list.
 * @see https://developers.coindesk.com/documentation/data-api/news_v1_article_list
 */

import type { NewsArticle, NewsFeedPage } from "@/lib/newsArticle";

const COINDESK_NEWS_URL = "https://data-api.coindesk.com/news/v1/article/list";

interface RawArticle {
  ID?: number;
  TITLE?: string;
  SUBTITLE?: string | null;
  BODY?: string;
  URL?: string;
  IMAGE_URL?: string | null;
  AUTHORS?: string;
  PUBLISHED_ON?: number;
  SENTIMENT?: string | null;
  SOURCE_DATA?: { NAME?: string } | null;
  CATEGORY_DATA?: { CATEGORY?: string; NAME?: string }[] | null;
}

interface RawResponse {
  Data?: RawArticle[];
  Err?: Record<string, unknown>;
}

function normalizeArticle(raw: RawArticle): NewsArticle | null {
  const id = raw.ID;
  const title = raw.TITLE?.trim();
  const url = raw.URL?.trim();
  if (id == null || !title || !url) return null;

  const categories = (raw.CATEGORY_DATA ?? [])
    .map((c) => c.CATEGORY ?? c.NAME)
    .filter((c): c is string => typeof c === "string" && c.length > 0);

  return {
    id,
    title,
    subtitle: raw.SUBTITLE?.trim() || null,
    body: raw.BODY?.trim() ?? "",
    url,
    imageUrl: raw.IMAGE_URL?.trim() || null,
    authors: raw.AUTHORS?.trim() ?? "",
    publishedAt: raw.PUBLISHED_ON ?? 0,
    sourceName: raw.SOURCE_DATA?.NAME?.trim() || null,
    categories,
  };
}

export async function fetchCoinDeskNewsPage(opts?: {
  limit?: number;
  cursor?: string;
  categories?: string[];
}): Promise<NewsFeedPage> {
  const limit = Math.min(Math.max(opts?.limit ?? 20, 1), 50);
  const params = new URLSearchParams({ limit: String(limit) });

  if (opts?.cursor) {
    params.set("to_ts", opts.cursor);
  }

  if (opts?.categories?.length) {
    params.set("categories", opts.categories.join(","));
  }

  const apiKey = process.env.COINDESK_API_KEY?.trim();
  if (apiKey) {
    params.set("api_key", apiKey);
  }

  const res = await fetch(`${COINDESK_NEWS_URL}?${params}`, {
    headers: { Accept: "application/json" },
    next: { revalidate: 0 },
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(
      text ? `CoinDesk news failed (${res.status}): ${text.slice(0, 200)}` : `CoinDesk news failed (${res.status})`
    );
  }

  const data = (await res.json()) as RawResponse;
  const err = data.Err ?? {};
  if (Object.keys(err).length > 0) {
    throw new Error(`CoinDesk news error: ${JSON.stringify(err).slice(0, 200)}`);
  }

  const articles = (data.Data ?? [])
    .map(normalizeArticle)
    .filter((a): a is NewsArticle => a != null);

  const last = articles[articles.length - 1];
  const nextCursor =
    articles.length >= limit && last?.publishedAt
      ? String(last.publishedAt)
      : undefined;

  return {
    articles,
    next: nextCursor ? { cursor: nextCursor } : null,
  };
}

