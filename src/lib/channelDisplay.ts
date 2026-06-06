import type { FeedColumnConfig } from "@/types";

const CHANNEL_URL_RE = /\/channel\/([^/?#]+)/i;

/** Strip optional # or / prefix from a channel id slug. */
export function normalizeChannelId(id: string): string {
  return id.replace(/^[#/]+/, "").trim();
}

/** Parse a Farcaster channel URL into a channel slug. */
export function channelSlugFromUrl(url: string): string | null {
  const m = url.match(CHANNEL_URL_RE);
  if (!m?.[1]) return null;
  const slug = normalizeChannelId(m[1]);
  return slug || null;
}

/** Channel id stored for feeds — a full https parent URL (e.g. https://basepaint.xyz). */
export function isUrlChannelId(id: string): boolean {
  return /^https?:\/\//i.test(id.trim());
}

/** Human slug for display from a feed channel id and optional search hint. */
export function channelDisplaySlug(id: string, hint?: string): string {
  if (!isUrlChannelId(id)) return normalizeChannelId(id);

  const fromParent = channelSlugFromUrl(id);
  if (fromParent) return fromParent;

  if (hint && !isUrlChannelId(hint)) return normalizeChannelId(hint);

  try {
    const host = new URL(id).hostname.replace(/^www\./, "");
    const base = host.split(".")[0];
    if (base && !["warpcast", "farcaster", "www"].includes(base)) return base;
  } catch {
    /* fall through */
  }

  return id;
}

/** Farcaster-style channel label, e.g. /mintedmerch or /basepaint for URL ids. */
export function formatChannelLabel(id: string, displayHint?: string): string {
  const slug = channelDisplaySlug(id, displayHint);
  if (!slug) return "";
  if (isUrlChannelId(slug)) return slug;
  return `/${slug}`;
}

/** Auto title for a channel column from channel id(s). */
export function channelColumnTitle(channelIds: string[]): string {
  if (channelIds.length === 0) return "";
  if (channelIds.length === 1) return formatChannelLabel(channelIds[0]);
  return `${channelIds.length} channels`;
}

/** Convert legacy #slug titles to /slug for channel columns. */
export function migrateChannelColumnTitle(
  column: Pick<FeedColumnConfig, "type" | "title" | "channelIds">
): string {
  if (column.type !== "channel") return column.title;

  const ids = column.channelIds ?? [];
  if (ids.length === 1) {
    const canonical = formatChannelLabel(ids[0]);
    const trimmed = column.title.trim();
    const slug = channelDisplaySlug(ids[0]);
    if (
      trimmed === `#${ids[0]}` ||
      trimmed === `#${slug}` ||
      trimmed === canonical
    ) {
      return canonical;
    }
  }

  const hashOnly = column.title.trim().match(/^#([a-z0-9][a-z0-9-]*)$/i);
  if (hashOnly) return `/${hashOnly[1]}`;

  return column.title;
}
