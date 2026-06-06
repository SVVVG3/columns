import Parser from "rss-parser";
import type { NewsArticle, NewsFeedPage } from "@/lib/newsArticle";

const MAX_FEED_BYTES = 2_000_000;
const FETCH_TIMEOUT_MS = 12_000;
const USER_AGENT = "Columns/1.0 (+https://mycolumns.xyz)";

const parser = new Parser({
  timeout: FETCH_TIMEOUT_MS,
  headers: {
    Accept: "application/rss+xml, application/atom+xml, application/xml, text/xml, */*",
    "User-Agent": USER_AGENT,
  },
});

/** Block private hosts — RSS is fetched server-side only. */
export function assertPublicFeedUrl(raw: string): URL {
  let parsed: URL;
  try {
    parsed = new URL(raw.trim());
  } catch {
    throw new Error("Invalid feed URL");
  }

  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new Error("Feed URL must use http or https");
  }

  const host = parsed.hostname.toLowerCase();
  if (
    host === "localhost" ||
    host.endsWith(".local") ||
    host === "127.0.0.1" ||
    host === "0.0.0.0" ||
    host === "[::1]" ||
    host === "::1" ||
    host.startsWith("10.") ||
    host.startsWith("192.168.") ||
    /^172\.(1[6-9]|2\d|3[0-1])\./.test(host)
  ) {
    throw new Error("That feed URL host is not allowed");
  }

  return parsed;
}

function stripHtml(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function itemImage(item: Parser.Item): string | null {
  const enclosure = item.enclosure;
  if (enclosure?.url && (enclosure.type?.startsWith("image/") || !enclosure.type)) {
    return enclosure.url;
  }

  const media = item as Parser.Item & {
    "media:content"?: { $?: { url?: string }; url?: string } | { $?: { url?: string }; url?: string }[];
    "media:thumbnail"?: { $?: { url?: string }; url?: string };
  };

  const content = media["media:content"];
  if (content) {
    const row = Array.isArray(content) ? content[0] : content;
    const url = row?.$?.url ?? row?.url;
    if (typeof url === "string" && url.length > 0) return url;
  }

  const thumb = media["media:thumbnail"];
  const thumbUrl = thumb?.$?.url ?? thumb?.url;
  if (typeof thumbUrl === "string" && thumbUrl.length > 0) return thumbUrl;

  const itunes = item as Parser.Item & { "itunes:image"?: { $?: { href?: string } } };
  const itunesUrl = itunes["itunes:image"]?.$?.href;
  if (typeof itunesUrl === "string" && itunesUrl.length > 0) return itunesUrl;

  return null;
}

function itemTimestamp(item: Parser.Item): number {
  const raw = item.isoDate ?? item.pubDate;
  if (!raw) return 0;
  const ms = new Date(raw).getTime();
  return Number.isNaN(ms) ? 0 : Math.floor(ms / 1000);
}

function normalizeItem(item: Parser.Item, feedTitle: string | undefined, index: number): NewsArticle | null {
  const title = item.title?.trim();
  const link = (item.link ?? item.guid ?? "").trim();
  if (!title || !link) return null;

  const body = stripHtml(item.contentSnippet ?? item.content ?? item.summary ?? "");
  const authors = item.creator ?? (item as Parser.Item & { author?: string }).author ?? "";
  const categories = (item.categories ?? []).filter((c): c is string => typeof c === "string");

  return {
    id: item.guid ?? item.link ?? `${title}-${index}`,
    title,
    body,
    url: link,
    imageUrl: itemImage(item),
    authors: typeof authors === "string" ? authors : "",
    publishedAt: itemTimestamp(item),
    sourceName: feedTitle?.trim() || null,
    categories,
  };
}

async function downloadFeedXml(feedUrl: URL): Promise<string> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  try {
    const res = await fetch(feedUrl.toString(), {
      headers: {
        Accept: "application/rss+xml, application/atom+xml, application/xml, text/xml, */*",
        "User-Agent": USER_AGENT,
      },
      signal: controller.signal,
      redirect: "follow",
    });

    if (!res.ok) {
      throw new Error(`Feed request failed (${res.status})`);
    }

    const contentLength = res.headers.get("content-length");
    if (contentLength && Number(contentLength) > MAX_FEED_BYTES) {
      throw new Error("Feed response is too large");
    }

    const text = await res.text();
    if (text.length > MAX_FEED_BYTES) {
      throw new Error("Feed response is too large");
    }
    return text;
  } finally {
    clearTimeout(timer);
  }
}

export async function fetchRssFeedArticles(feedUrl: string): Promise<NewsArticle[]> {
  const url = assertPublicFeedUrl(feedUrl);
  const xml = await downloadFeedXml(url);
  const feed = await parser.parseString(xml);
  const feedTitle = feed.title ?? url.hostname.replace(/^www\./i, "");

  return (feed.items ?? [])
    .map((item, index) => normalizeItem(item, feedTitle, index))
    .filter((a): a is NewsArticle => a != null)
    .sort((a, b) => b.publishedAt - a.publishedAt);
}

export function paginateNewsArticles(
  articles: NewsArticle[],
  opts?: { limit?: number; cursor?: string }
): NewsFeedPage {
  const limit = Math.min(Math.max(opts?.limit ?? 20, 1), 50);
  const offset = opts?.cursor ? Math.max(0, parseInt(opts.cursor, 10) || 0) : 0;
  const slice = articles.slice(offset, offset + limit);
  const nextOffset = offset + limit;
  const hasMore = nextOffset < articles.length;

  return {
    articles: slice,
    next: hasMore ? { cursor: String(nextOffset) } : null,
  };
}
