import type { FeedColumnConfig } from "@/types";

export function buildCastFeedUrl(
  column: FeedColumnConfig,
  cursor?: string,
  fresh?: boolean
): string {
  const base = (() => {
    switch (column.type) {
      case "home":
        return "/api/feed/home";
      case "trending":
        return "/api/feed/trending";
      case "channel":
        return `/api/feed/channel?channelIds=${(column.channelIds ?? []).join(",")}`;
      case "user": {
        const fids = column.targetFids ?? (column.targetFid ? [column.targetFid] : []);
        return `/api/feed/user?fids=${fids.join(",")}`;
      }
      case "keyword": {
        const qs = column.queries ?? (column.query ? [column.query] : []);
        return `/api/feed/keyword?queries=${qs.map(encodeURIComponent).join(",")}`;
      }
      case "coindesk":
        return "/api/feed/coindesk";
      case "rss":
        return "/api/feed/rss";
    }
  })();

  const params = new URLSearchParams();
  params.set("limit", "25");
  if (cursor) params.set("cursor", cursor);
  if (fresh) params.set("fresh", "1");
  if (column.type === "rss" && column.rssUrl) {
    params.set("url", column.rssUrl);
  }
  const qs = params.toString();
  return `${base}${base.includes("?") ? "&" : "?"}${qs}`;
}

export function buildNewsFeedUrl(column: FeedColumnConfig, cursor?: string): string {
  const params = new URLSearchParams({ limit: "20" });
  if (cursor) params.set("cursor", cursor);

  if (column.type === "rss") {
    if (!column.rssUrl) throw new Error("RSS column is missing a feed URL");
    params.set("url", column.rssUrl);
    return `/api/feed/rss?${params}`;
  }

  return `/api/feed/coindesk?${params}`;
}

export function isNewsFeedColumn(column: FeedColumnConfig): boolean {
  return column.type === "rss" || column.type === "coindesk";
}
