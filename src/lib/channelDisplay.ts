import type { FeedColumnConfig } from "@/types";

/** Strip optional # or / prefix from a channel id slug. */
export function normalizeChannelId(id: string): string {
  return id.replace(/^[#/]+/, "").trim();
}

/** Farcaster-style channel label, e.g. /mintedmerch */
export function formatChannelLabel(id: string): string {
  const slug = normalizeChannelId(id);
  return slug ? `/${slug}` : "";
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
    const slug = normalizeChannelId(ids[0]);
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
