/**
 * Viewer context hydration.
 *
 * Two strategies depending on context:
 *
 * 1. Feed routes — `getBatchViewerContext` (batch cast-interactions) with
 *    fallback to `getViewerContext`, plus `hydrateFeedReactions` on the first N
 *    casts per page (per-cast `reaction/cast` for counts).
 *
 * 2. Conversation route — `getConversationViewerContext`: queries
 *    `reaction/cast` for every cast in the tree. Slower (N parallel calls)
 *    but accurate for ALL historical likes regardless of how old they are,
 *    and practical because conversation panels have only 5–20 casts.
 */

import { hsnap, hsnapPost } from "@/lib/hypersnap";
import { withCache } from "@/lib/feedCache";

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
}

/** Fetch the current user's recent likes and recasts in parallel. */
export async function getViewerContext(fid: number): Promise<ViewerContext> {
  const [liked, recasted] = await Promise.all([
    fetchReactionHashes(fid, "likes"),
    fetchReactionHashes(fid, "recasts"),
  ]);
  return { liked, recasted };
}

interface BatchCastInteraction {
  hash: string;
  liked?: boolean;
  recasted?: boolean;
  replied?: boolean;
}

type BatchCastInteractionsResponse = Record<string, BatchCastInteraction[]>;

function interactionsForFid(
  data: BatchCastInteractionsResponse,
  fid: number
): BatchCastInteraction[] {
  const key = String(fid);
  return data[key] ?? data[fid as unknown as string] ?? [];
}

/** Viewer liked/recasted state from Hypersnap batch cast-interactions. */
export async function getBatchViewerContext(fid: number): Promise<ViewerContext> {
  const cacheKey = `batch-interactions:${fid}`;
  const data = await withCache<BatchCastInteractionsResponse>(cacheKey, REACTION_TTL, () =>
    hsnapPost<BatchCastInteractionsResponse>("/v2/farcaster/batch/cast-interactions", {
      fids: [fid],
    })
  );

  const liked = new Set<string>();
  const recasted = new Set<string>();
  for (const item of interactionsForFid(data, fid)) {
    if (!item.hash) continue;
    const h = normalizeCastHash(item.hash);
    if (item.liked) liked.add(h);
    if (item.recasted) recasted.add(h);
  }
  return { liked, recasted };
}

/** Batch interactions when available; otherwise recent reaction/user (100 cap). */
export async function getFeedViewerContext(fid: number): Promise<ViewerContext> {
  try {
    return await getBatchViewerContext(fid);
  } catch (err) {
    console.warn("[viewerContext] batch cast-interactions failed, using reaction/user", err);
    return getViewerContext(fid);
  }
}

/**
 * Per-cast reaction lookup for a feed page — same accuracy as the conversation
 * sidebar (not limited to the 100 most recent likes from reaction/user).
 */
export async function getViewerContextForCasts(
  casts: Record<string, unknown>[],
  viewerFid: number
): Promise<ViewerContext> {
  const hashes = [
    ...new Set(
      casts
        .map((c) => c.hash as string)
        .filter(Boolean)
        .map(normalizeCastHash)
    ),
  ];
  if (hashes.length === 0) return { liked: new Set(), recasted: new Set() };

  const [likerEntries, recasterEntries] = await Promise.all([
    Promise.all(hashes.map(async (h) => [h, await fetchCastReactorFids(h, "likes")] as const)),
    Promise.all(hashes.map(async (h) => [h, await fetchCastReactorFids(h, "recasts")] as const)),
  ]);

  const liked = new Set(
    likerEntries.filter(([, fids]) => fids.includes(viewerFid)).map(([h]) => h)
  );
  const recasted = new Set(
    recasterEntries.filter(([, fids]) => fids.includes(viewerFid)).map(([h]) => h)
  );
  return { liked, recasted };
}

/**
 * Stamp `viewer_context: { liked, recasted }` onto each cast in the array.
 * Returns a new array — does not mutate the input.
 */
/** How many casts per feed page get per-cast reaction/cast hydration (counts + liked). */
export const FEED_REACTION_HYDRATE_LIMIT = 15;

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

export interface FeedReactionHydration {
  hydratedHashes: Set<string>;
  liked: Set<string>;
  recasted: Set<string>;
  likeCounts: Map<string, number>;
  recastCounts: Map<string, number>;
}

/** Per-cast reaction/cast for the top of a feed page (sidebar-accurate counts). */
export async function hydrateFeedReactions(
  casts: Record<string, unknown>[],
  viewerFid: number
): Promise<FeedReactionHydration> {
  const slice = casts.slice(0, FEED_REACTION_HYDRATE_LIMIT);
  const hashes = [
    ...new Set(
      slice
        .map((c) => c.hash as string)
        .filter(Boolean)
        .map(normalizeCastHash)
    ),
  ];

  const entries = await mapWithConcurrency(hashes, REACTION_FETCH_CONCURRENCY, async (h) => {
    const [likers, recasters] = await Promise.all([
      fetchCastReactorFids(h, "likes"),
      fetchCastReactorFids(h, "recasts"),
    ]);
    return { h, likers, recasters };
  });

  const hydratedHashes = new Set(hashes);
  const liked = new Set(
    entries.filter((e) => e.likers.includes(viewerFid)).map((e) => e.h)
  );
  const recasted = new Set(
    entries.filter((e) => e.recasters.includes(viewerFid)).map((e) => e.h)
  );
  const likeCounts = new Map(entries.map((e) => [e.h, e.likers.length]));
  const recastCounts = new Map(entries.map((e) => [e.h, e.recasters.length]));

  return { hydratedHashes, liked, recasted, likeCounts, recastCounts };
}

export function annotateFeedCasts(
  casts: Record<string, unknown>[],
  hydration: FeedReactionHydration,
  baseVc: ViewerContext
): Record<string, unknown>[] {
  return casts.map((cast) => {
    const hash = normalizeCastHash(cast.hash as string);
    const hydrated = hydration.hydratedHashes.has(hash);
    const existingReactions = (cast.reactions ?? {}) as Record<string, unknown>;

    return {
      ...cast,
      reactions: hydrated
        ? {
            ...existingReactions,
            likes_count: hydration.likeCounts.get(hash) ?? existingReactions.likes_count ?? 0,
            recasts_count:
              hydration.recastCounts.get(hash) ?? existingReactions.recasts_count ?? 0,
          }
        : cast.reactions,
      viewer_context: {
        liked: hydrated ? hydration.liked.has(hash) : baseVc.liked.has(hash),
        recasted: hydrated ? hydration.recasted.has(hash) : baseVc.recasted.has(hash),
      },
    };
  });
}

const REPLY_COUNT_TTL = 30_000;

interface ConversationCountResponse {
  conversation?: { cast?: { replies?: { count?: number } } };
}

/** Reply counts from cast/conversation (popular feed often ships replies.count: 0). */
export async function hydrateReplyCounts(
  casts: Record<string, unknown>[]
): Promise<Map<string, number>> {
  const hashes = [
    ...new Set(
      casts
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
    return {
      ...cast,
      replies: { ...existing, count: replyCounts.get(hash) ?? existing.count ?? 0 },
    };
  });
}

export function annotateViewerContext(
  casts: Record<string, unknown>[],
  { liked, recasted }: ViewerContext
): Record<string, unknown>[] {
  return casts.map((cast) => {
    const hash = normalizeCastHash(cast.hash as string);
    return {
      ...cast,
      viewer_context: {
        liked: liked.has(hash),
        recasted: recasted.has(hash),
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
    },
    direct_replies: directReplies,
  };
}

// ── Per-cast reaction lookup (used by conversation route) ──────────────────────

/** Collect all cast hashes from a nested cast tree. */
function collectCastHashes(cast: Record<string, unknown>): string[] {
  const hash = normalizeCastHash(cast.hash as string);
  const replies = (cast.direct_replies as Record<string, unknown>[] ?? []);
  return [hash, ...replies.flatMap((r) => collectCastHashes(r))];
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
 * Build viewer_context + reaction counts for an entire conversation tree by
 * querying `reaction/cast` for every cast. More accurate than `reaction/user`
 * because it reflects ALL historical likes, not just the most recent 100.
 *
 * Also returns like/recast counts so comments that previously showed "0" now
 * show real numbers.
 *
 * Use only for conversation panels (small N).
 */
export async function getConversationViewerContext(
  rootCast: Record<string, unknown>,
  viewerFid: number
): Promise<ConversationViewerContext> {
  const hashes = collectCastHashes(rootCast);

  const [likerEntries, recasterEntries] = await Promise.all([
    Promise.all(hashes.map(async (h) => [h, await fetchCastReactorFids(h, "likes")] as const)),
    Promise.all(hashes.map(async (h) => [h, await fetchCastReactorFids(h, "recasts")] as const)),
  ]);

  const liked = new Set(likerEntries.filter(([, fids]) => fids.includes(viewerFid)).map(([h]) => h));
  const recasted = new Set(recasterEntries.filter(([, fids]) => fids.includes(viewerFid)).map(([h]) => h));
  const likeCounts = new Map(likerEntries.map(([h, fids]) => [h, fids.length]));
  const recastCounts = new Map(recasterEntries.map(([h, fids]) => [h, fids.length]));

  return { liked, recasted, likeCounts, recastCounts };
}

/**
 * Stamp `viewer_context` AND real reaction counts onto a cast tree.
 * Replaces `reactions.likes_count` / `reactions.recasts_count` with counts
 * obtained from `reaction/cast`, fixing the "0 likes on comments" issue.
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
      likes_count: vc.likeCounts.get(hash) ?? existingReactions.likes_count ?? 0,
      recasts_count: vc.recastCounts.get(hash) ?? existingReactions.recasts_count ?? 0,
    },
    viewer_context: {
      liked: vc.liked.has(hash),
      recasted: vc.recasted.has(hash),
    },
    direct_replies: directReplies,
  };
}
