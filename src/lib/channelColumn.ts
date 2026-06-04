import {
  channelColumnTitle,
  formatChannelLabel,
  normalizeChannelId,
} from "@/lib/channelDisplay";
import type { FeedColumnConfig } from "@/types";

const DEFAULT_REFRESH_MS = 60_000;

/** Build a channel feed column config for a single channel slug. */
export function channelColumnFromSlug(channelId: string): FeedColumnConfig {
  const id = normalizeChannelId(channelId);
  return {
    id: `channel-${id}-${Date.now()}`,
    type: "channel",
    title: channelColumnTitle([id]),
    channelIds: [id],
    refreshInterval: DEFAULT_REFRESH_MS,
  };
}

export function columnHasChannel(
  columns: FeedColumnConfig[],
  channelId: string
): boolean {
  const slug = normalizeChannelId(channelId);
  return columns.some(
    (c) =>
      c.type === "channel" &&
      (c.channelIds ?? []).some((cid) => normalizeChannelId(cid) === slug)
  );
}
