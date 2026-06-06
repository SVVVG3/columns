import {
  channelDisplaySlug,
  isUrlChannelId,
  normalizeChannelId,
} from "@/lib/channelDisplay";
import { channelSlugFromUrl } from "@/lib/channelDisplay";
import { hsnap, isHypersnapError } from "@/lib/hypersnap";

/** Channel record from Hypersnap read API (search, lookup, bulk). */
export interface HypersnapChannel {
  id: string;
  name?: string;
  image_url?: string;
  follower_count?: number;
  member_count?: number;
  description?: string;
  parent_url?: string;
  url?: string;
}

export interface ChannelSearchResult {
  /** Id passed to Hypersnap feed APIs (slug or parent URL). */
  id: string;
  /** Slug for UI labels, e.g. basepaint for https://basepaint.xyz. */
  displaySlug: string;
  name: string;
  image_url: string | null;
  follower_count: number;
  member_count: number;
}

function isTokenChannel(ch: HypersnapChannel): boolean {
  const id = ch.id;
  return /eip155:/i.test(id) || /erc20:/i.test(id);
}

function mapChannel(ch: HypersnapChannel, queryHint?: string): ChannelSearchResult {
  return {
    id: ch.id,
    displaySlug: channelDisplaySlug(ch.id, queryHint),
    name: ch.name?.trim() || channelDisplaySlug(ch.id, queryHint),
    image_url: ch.image_url ?? null,
    follower_count: ch.follower_count ?? 0,
    member_count: ch.member_count ?? 0,
  };
}

function rankChannel(ch: ChannelSearchResult, q: string): number {
  const query = normalizeChannelId(q).toLowerCase();
  const slug = ch.displaySlug.toLowerCase();
  if (slug === query) return 0;
  if (slug.startsWith(query)) return 1;
  if (ch.id.toLowerCase().startsWith(query)) return 2;
  return 3;
}

async function lookupHypersnapChannelOnce(
  id: string,
  type?: "id" | "parent_url"
): Promise<HypersnapChannel | null> {
  try {
    const data = await hsnap<{ channel?: HypersnapChannel }>("/v2/farcaster/channel", {
      id,
      ...(type ? { type } : {}),
    });
    return data.channel ?? null;
  } catch (err) {
    if (isHypersnapError(err) && err.status === 404) return null;
    throw err;
  }
}

/** True when the channel feed returns at least one cast (filters ghost registry entries). */
export async function channelHasFeedCasts(channelId: string): Promise<boolean> {
  try {
    const data = await hsnap<{ casts?: unknown[] }>("/v2/farcaster/feed/channels", {
      channel_ids: channelId,
      limit: 1,
    });
    return (data.casts?.length ?? 0) > 0;
  } catch {
    return false;
  }
}

/**
 * Resolve a channel by slug, parent URL, or common parent_url patterns.
 * Used when prefix search misses (e.g. basepaint → https://basepaint.xyz).
 */
export async function lookupHypersnapChannel(
  rawQuery: string
): Promise<ChannelSearchResult | null> {
  const query = normalizeChannelId(rawQuery.trim());
  if (!query) return null;

  const attempts: { id: string; type?: "id" | "parent_url" }[] = [];

  if (isUrlChannelId(query)) {
    attempts.push({ id: query, type: "parent_url" }, { id: query, type: "id" });
  } else {
    attempts.push(
      { id: query, type: "id" },
      { id: `https://warpcast.com/~/channel/${query}`, type: "parent_url" },
      { id: `https://farcaster.xyz/~/channel/${query}`, type: "parent_url" },
      { id: `https://${query}.xyz`, type: "parent_url" },
      { id: `https://www.${query}.xyz`, type: "parent_url" }
    );
  }

  const seen = new Set<string>();
  for (const { id, type } of attempts) {
    const key = `${type ?? "id"}:${id}`;
    if (seen.has(key)) continue;
    seen.add(key);

    const channel = await lookupHypersnapChannelOnce(id, type);
    if (channel) return mapChannel(channel, query);
  }

  return null;
}

async function filterChannelsWithFeedActivity(
  channels: ChannelSearchResult[]
): Promise<ChannelSearchResult[]> {
  if (channels.length === 0) return [];

  const flags = await Promise.all(
    channels.map((ch) => channelHasFeedCasts(ch.id))
  );

  return channels.filter((_, i) => flags[i]);
}

/**
 * Prefix search against Hypersnap's channel index, bulk-enrich, then drop
 * token URIs and ghost entries with no feed casts (e.g. id "bankr", 0 casts).
 */
export async function searchHypersnapChannels(
  q: string,
  limit = 10
): Promise<ChannelSearchResult[]> {
  const query = q.trim();
  if (!query) return [];

  const searchData = await hsnap<{ channels?: HypersnapChannel[] }>(
    "/v2/farcaster/channel/search",
    { q: query, limit: Math.max(limit, 15) }
  );

  let hits = (searchData.channels ?? []).filter((ch) => !isTokenChannel(ch));
  if (hits.length === 0) return [];

  const ids = hits.map((ch) => ch.id).join(",");
  const bulkData = await hsnap<{ channels?: HypersnapChannel[] }>(
    "/v2/farcaster/channel/bulk",
    { ids }
  );

  const byId = new Map((bulkData.channels ?? []).map((ch) => [ch.id, ch]));

  let mapped = hits
    .map((hit) => {
      const ch = byId.get(hit.id) ?? hit;
      if (isTokenChannel(ch)) return null;
      const slug = channelSlugFromUrl(ch.parent_url ?? ch.id);
      if (slug && slug !== ch.id && !isUrlChannelId(ch.id)) {
        return mapChannel({ ...ch, id: ch.id }, slug);
      }
      return mapChannel(ch, query);
    })
    .filter((ch): ch is ChannelSearchResult => ch !== null);

  mapped.sort((a, b) => rankChannel(a, query) - rankChannel(b, query));

  mapped = await filterChannelsWithFeedActivity(mapped);

  return mapped.slice(0, limit);
}
