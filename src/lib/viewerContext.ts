/**
 * Viewer context hydration.
 *
 * Feed routes use `getFeedViewerContext` (batch cast-interactions, with a
 * reaction/user fallback) and keep like/recast counts from the cast payload.
 *
 * Conversation routes do the same, and call `reaction/cast` only for casts
 * whose like or recast count is missing or zero. A positive count on the cast
 * is never replaced by the length of that list.
 */

import { hsnap, hsnapPost } from "@/lib/hypersnap";
import { getCached, setCached, withCache } from "@/lib/feedCache";

const REACTION_TTL = 60_000; // 60 s
const CAST_REACTION_TTL = 30_000; // 30 s (per-cast liker lists)

// Hypersnap caps reaction/user at 100 items and does not support cursor pagination.
const PAGE_SIZE = 100;

/** Normalize cast hash for Set lookups (strip 0x, lowercase). */
export function normalizeCastHash(hash: string): string {
  const h = hash.toLowerCase();
  return h.startsWith("0x") ? h.slice(2) : h;
}

interface ReactionResponse {
  reactions: Array<{ cast: { hash: string } }>;
}

interface CastReactionResponse {
  reactions: Array<{ user: { fid: number } }>;
}

async function fetchReactionHashes(
  fid: number,
  type: "likes" | "recasts"
): Promise<Set<string>> {
  const cacheKey = `viewer:${fid}:${type}`;
  const data = await withCache<ReactionResponse>(cacheKey, REACTION_TTL, () =>
    hsnap<ReactionResponse>("/v2/farcaster/reaction/user", {
      fid,
      type,
      limit: PAGE_SIZE,
    })
  );
  return new Set(
    (data.reactions ?? [])
      .map((r) => r.cast?.hash)
      .filter(Boolean)
      .map((h) => normalizeCastHash(h as string))
  );
}

export interface ViewerContext {
  liked: Set<string>;
  recasted: Set<string>;
  replied: Set<string>;
}

/** Fetch the current user's recent likes, recasts, and replies in parallel. */
export async function getViewerContext(fid: number): Promise<ViewerContext> {
  const [liked, recasted, replied] = await Promise.all([
    fetchReactionHashes(fid, "likes"),
    fetchReactionHashes(fid, "recasts"),
    fetchRepliedParentHashes(fid),
  ]);
  return { liked, recasted, replied };
}

interface RepliesFeedResponse {
  casts?: Array<{ parent_hash?: string }>;
}

/** Parent hashes of the viewer's recent replies. Those casts are ones they answered. */
async function fetchRepliedParentHashes(fid: number): Promise<Set<string>> {
  const cacheKey = `viewer:${fid}:replies`;
  const data = await withCache<RepliesFeedResponse>(cacheKey, REACTION_TTL, () =>
    hsnap<RepliesFeedResponse>("/v2/farcaster/feed/user/replies_and_recasts", {
      fid,
      limit: PAGE_SIZE,
    })
  );
  const hashes = new Set<string>();
  for (const cast of data.casts ?? []) {
    if (typeof cast.parent_hash === "string" && cast.parent_hash.length > 0) {
      hashes.add(normalizeCastHash(cast.parent_hash));
    }
  }
  return hashes;
}

/** True when a batch row is the documented `{ hash, liked, recasted, replied }` shape. */
export function batchInteractionUsable(item: unknown): item is BatchCastInteraction {
  if (!item || typeof item !== "object") return false;
  const row = item as BatchCastInteraction;
  return typeof row.hash === "string" && row.hash.length > 0;
}

/**
 * Parse POST /batch/cast-interactions.
 * Returns null when the node sends rows with no cast hash — that payload cannot mark likes or replies.
 */
export function parseBatchInteractions(data: unknown, fid: number): ViewerContext | null {
  if (!data || typeof data !== "object") return null;
  const record = data as Record<string, unknown>;
  const rows = record[String(fid)];
  if (!Array.isArray(rows)) return null;
  if (rows.length > 0 && !rows.some(batchInteractionUsable)) return null;

  const liked = new Set<string>();
  const recasted = new Set<string>();
  const replied = new Set<string>();
  for (const item of rows) {
    if (!batchInteractionUsable(item)) continue;
    const hash = normalizeCastHash(item.hash);
    if (item.liked) liked.add(hash);
    if (item.recasted) recasted.add(hash);
    if (item.replied) replied.add(hash);
  }
  return { liked, recasted, replied };
}

interface BatchCastInteraction {
  hash: string;
  liked?: boolean;
  recasted?: boolean;
  replied?: boolean;
}

const BATCH_SKIP_TTL = 5 * 60_000;

/** Viewer liked/recasted/replied state from Hypersnap batch cast-interactions. Null when the payload has no hashes. */
export async function getBatchViewerContext(fid: number): Promise<ViewerContext | null> {
  const skipKey = `batch-interactions:${fid}:skip`;
  if (getCached(skipKey)) return null;

  const cacheKey = `batch-interactions:${fid}`;
  const cached = getCached(cacheKey);
  if (cached) return cached as ViewerContext;

  const data = await hsnapPost<unknown>("/v2/farcaster/batch/cast-interactions", {
    fids: [fid],
  });
  const parsed = parseBatchInteractions(data, fid);
  if (!parsed) {
    setCached(skipKey, true, BATCH_SKIP_TTL);
    return null;
  }
  setCached(cacheKey, parsed, REACTION_TTL);
  return parsed;
}

/** Batch interactions when the payload is usable; otherwise recent likes, recasts, and replies. */
export async function getFeedViewerContext(fid: number): Promise<ViewerContext> {
  try {
    const batch = await getBatchViewerContext(fid);
    if (batch) return batch;
  } catch (err) {
    console.warn("[viewerContext] batch cast-interactions failed, using reaction/user", err);
  }
  return getViewerContext(fid);
}

const REACTION_FETCH_CONCURRENCY = 6;

async function mapWithConcurrency<T, R>(
  items: T[],
  concurrency: number,
  fn: (item: T) => Promise<R>
): Promise<R[]> {
  if (items.length === 0) return [];
  const results = new Array<R>(items.length);
  let next = 0;
  async function worker() {
    while (next < items.length) {
      const i = next++;
      results[i] = await fn(items[i]);
    }
  }
  const workers = Math.min(concurrency, items.length);
  await Promise.all(Array.from({ length: workers }, () => worker()));
  return results;
}

const REPLY_COUNT_TTL = 30_000;

interface ConversationCountResponse {
  conversation?: { cast?: { replies?: { count?: number } } };
}

/** Reply counts from cast/conversation when the payload count is missing or zero. */
export async function hydrateReplyCounts(
  casts: Record<string, unknown>[]
): Promise<Map<string, number>> {
  const hashes = [
    ...new Set(
      casts
        .filter((c) => countNeedsLookup(castReplyCount(c)))
        .map((c) => c.hash as string)
        .filter(Boolean)
        .map(normalizeCastHash)
    ),
  ];
  if (hashes.length === 0) return new Map();

  const entries = await mapWithConcurrency(hashes, REACTION_FETCH_CONCURRENCY, async (h) => {
    const normalized = `0x${h}`;
    const cacheKey = `reply-count:${h}`;
    const data = await withCache<ConversationCountResponse>(cacheKey, REPLY_COUNT_TTL, () =>
      hsnap<ConversationCountResponse>("/v2/farcaster/cast/conversation", {
        identifier: normalized,
        type: "hash",
        reply_depth: 0,
      })
    );
    const count = data.conversation?.cast?.replies?.count;
    return [h, typeof count === "number" ? count : 0] as const;
  });

  return new Map(entries);
}

export function annotateReplyCounts(
  casts: Record<string, unknown>[],
  replyCounts: Map<string, number>
): Record<string, unknown>[] {
  return casts.map((cast) => {
    const hash = normalizeCastHash(cast.hash as string);
    if (!replyCounts.has(hash)) return cast;
    const existing = (cast.replies ?? {}) as Record<string, unknown>;
    const fetched = replyCounts.get(hash);
    return {
      ...cast,
      replies: { ...existing, count: resolvedCount(castReplyCount(cast), fetched) },
    };
  });
}

export function annotateViewerContext(
  casts: Record<string, unknown>[],
  { liked, recasted, replied }: ViewerContext
): Record<string, unknown>[] {
  return casts.map((cast) => {
    const hash = normalizeCastHash(cast.hash as string);
    return {
      ...cast,
      viewer_context: {
        liked: liked.has(hash),
        recasted: recasted.has(hash),
        replied: replied.has(hash),
      },
    };
  });
}

/**
 * Recursively stamp `viewer_context` onto a cast tree (root + all direct_replies).
 * Used for the conversation/thread route where casts are nested, not flat.
 */
export function annotateViewerContextTree(
  cast: Record<string, unknown>,
  vc: ViewerContext
): Record<string, unknown> {
  const hash = normalizeCastHash(cast.hash as string);
  const directReplies = (cast.direct_replies as Record<string, unknown>[] ?? []).map(
    (r) => annotateViewerContextTree(r, vc)
  );
  return {
    ...cast,
    viewer_context: {
      liked: vc.liked.has(hash),
      recasted: vc.recasted.has(hash),
      replied: vc.replied.has(hash),
    },
    direct_replies: directReplies,
  };
}

// ── Per-cast reaction lookup (used by conversation route) ──────────────────────

function numericField(value: unknown): number | null {
  return typeof value === "number" ? value : null;
}

function castReactionCount(
  cast: Record<string, unknown>,
  field: "likes_count" | "recasts_count"
): number | null {
  const reactions = cast.reactions as Record<string, unknown> | undefined;
  return numericField(reactions?.[field]);
}

function castReplyCount(cast: Record<string, unknown>): number | null {
  const replies = cast.replies as Record<string, unknown> | undefined;
  return numericField(replies?.count);
}

function countNeedsLookup(count: number | null): boolean {
  return count == null || count <= 0;
}

/** Keep a positive cast count. Use a lookup only to fill a missing or zero count. */
function resolvedCount(existing: number | null, fetched: number | undefined): number {
  if (existing != null && existing > 0 && (fetched == null || existing >= fetched)) return existing;
  if (fetched != null) return fetched;
  return existing ?? 0;
}

function flattenCasts(cast: Record<string, unknown>): Record<string, unknown>[] {
  const replies = (cast.direct_replies as Record<string, unknown>[] | undefined) ?? [];
  return [cast, ...replies.flatMap((reply) => flattenCasts(reply))];
}

/** Fetch FIDs of everyone who reacted to a specific cast. Cached 30 s. */
async function fetchCastReactorFids(
  hash: string,
  type: "likes" | "recasts"
): Promise<number[]> {
  const bare = normalizeCastHash(hash);
  const normalized = `0x${bare}`;
  const cacheKey = `cast:${type}:${bare}`;
  const data = await withCache<CastReactionResponse>(cacheKey, CAST_REACTION_TTL, () =>
    hsnap<CastReactionResponse>("/v2/farcaster/reaction/cast", {
      hash: normalized,
      types: type,
      limit: 100,
    })
  );
  return (data.reactions ?? []).map((r) => r.user?.fid).filter(Boolean) as number[];
}

export interface ConversationViewerContext extends ViewerContext {
  /** Number of likes per cast hash (from reaction/cast, up to 100). */
  likeCounts: Map<string, number>;
  /** Number of recasts per cast hash (from reaction/cast, up to 100). */
  recastCounts: Map<string, number>;
}

/**
 * Liked/recasted state from batch cast-interactions. `reaction/cast` runs only
 * for casts whose like or recast count is missing or zero.
 */
export async function getConversationViewerContext(
  rootCast: Record<string, unknown>,
  viewerFid: number
): Promise<ConversationViewerContext> {
  const casts = flattenCasts(rootCast);
  const needLikes = casts.filter((c) => countNeedsLookup(castReactionCount(c, "likes_count")));
  const needRecasts = casts.filter((c) => countNeedsLookup(castReactionCount(c, "recasts_count")));

  const [baseVc, likerEntries, recasterEntries] = await Promise.all([
    getFeedViewerContext(viewerFid),
    mapWithConcurrency(needLikes, REACTION_FETCH_CONCURRENCY, async (cast) => {
      const hash = normalizeCastHash(cast.hash as string);
      return [hash, await fetchCastReactorFids(hash, "likes")] as const;
    }),
    mapWithConcurrency(needRecasts, REACTION_FETCH_CONCURRENCY, async (cast) => {
      const hash = normalizeCastHash(cast.hash as string);
      return [hash, await fetchCastReactorFids(hash, "recasts")] as const;
    }),
  ]);

  const liked = new Set(baseVc.liked);
  const recasted = new Set(baseVc.recasted);
  for (const [hash, fids] of likerEntries) {
    if (fids.includes(viewerFid)) liked.add(hash);
  }
  for (const [hash, fids] of recasterEntries) {
    if (fids.includes(viewerFid)) recasted.add(hash);
  }

  return {
    liked,
    recasted,
    replied: baseVc.replied,
    likeCounts: new Map(likerEntries.map(([hash, fids]) => [hash, fids.length])),
    recastCounts: new Map(recasterEntries.map(([hash, fids]) => [hash, fids.length])),
  };
}

/**
 * Stamp `viewer_context` onto a cast tree. Fill a like or recast count from
 * `reaction/cast` only when the cast's own count is missing or zero.
 */
export function annotateConversationTree(
  cast: Record<string, unknown>,
  vc: ConversationViewerContext
): Record<string, unknown> {
  const hash = normalizeCastHash(cast.hash as string);
  const directReplies = (cast.direct_replies as Record<string, unknown>[] ?? []).map(
    (r) => annotateConversationTree(r, vc)
  );
  const existingReactions = (cast.reactions ?? {}) as Record<string, unknown>;
  return {
    ...cast,
    reactions: {
      ...existingReactions,
      likes_count: resolvedCount(castReactionCount(cast, "likes_count"), vc.likeCounts.get(hash)),
      recasts_count: resolvedCount(
        castReactionCount(cast, "recasts_count"),
        vc.recastCounts.get(hash)
      ),
    },
    viewer_context: {
      liked: vc.liked.has(hash),
      recasted: vc.recasted.has(hash),
      replied: vc.replied.has(hash),
    },
    direct_replies: directReplies,
  };
}
