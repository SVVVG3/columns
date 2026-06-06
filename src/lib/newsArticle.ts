export interface NewsArticle {
  id: string | number;
  title: string;
  subtitle?: string | null;
  body: string;
  url: string;
  imageUrl?: string | null;
  authors?: string;
  publishedAt: number;
  sourceName?: string | null;
  categories?: string[];
}

export interface NewsFeedPage {
  articles: NewsArticle[];
  next?: { cursor?: string } | null;
}

export function formatNewsTime(publishedAt: number): string {
  if (!publishedAt) return "";
  const ms = publishedAt < 1e12 ? publishedAt * 1000 : publishedAt;
  const diff = Date.now() - ms;
  if (diff < 0) return "now";
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return "now";
  if (mins < 60) return `${mins}m`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `${days}d`;
  return new Date(ms).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

export function newsExcerpt(body: string, max = 220): string {
  const text = body.replace(/\s+/g, " ").trim();
  if (!text) return "";
  if (text.length <= max) return text;
  return `${text.slice(0, max).trimEnd()}…`;
}

export function rssColumnTitle(url: string): string {
  try {
    const host = new URL(url.trim()).hostname.replace(/^www\./i, "");
    return host || "RSS Feed";
  } catch {
    return "RSS Feed";
  }
}
