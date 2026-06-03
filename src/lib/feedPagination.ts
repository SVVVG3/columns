import { hsnap } from "@/lib/hypersnap";
import { fetchCastByHash } from "@/lib/castLookup";
import { filterRootCasts } from "@/lib/castFilters";
import { normalizeCastHash } from "@/lib/viewerContext";

export const DEFAULT_PAGE_LIMIT = 25;
export const MAX_PAGE_LIMIT = 50;
/** Multi-user columns embed per-FID Hypersnap cursors; 4KB was too small and broke page 2+. */
export const MAX_FEED_CURSOR_BYTES = 14_000;

/** Hypersnap fetch size — extra headroom because many items are reply-only. */
const FETCH_MULTIPLIER = 2;
const MAX_HSNAP_LIMIT = 50;
/** Max hashes stored per user in cursor (keeps URL small). */
const MAX_PENDING_HASHES_PER_FID = 25;

interface FeedPage {
  casts: Record<string, unknown>[];
  next?: { cursor?: string | null };
}

export function clampPageSize(limit: number | undefined): number {
  const n = limit ?? DEFAULT_PAGE_LIMIT;
  return Math.min(Math.max(n, 1), MAX_PAGE_LIMIT);
}

function hsnapLimitForPage(pageSize: number): number {
  return Math.min(MAX_HSNAP_LIMIT, Math.max(pageSize * FETCH_MULTIPLIER, 16));
}

function capPage(casts: Record<string, unknown>[], pageSize: number): Record<string, unknown>[] {
  return casts.slice(0, pageSize);
}

function castTimestamp(cast: Record<string, unknown>): number {
  return new Date(cast.timestamp as string).getTime();
}

function authorFid(cast: Record<string, unknown>): number | null {
  const fid = (cast.author as { fid?: number } | undefined)?.fid;
  return typeof fid === "number" ? fid : null;
}

function dedupeSortCasts(casts: Record<string, unknown>[]): Record<string, unknown>[] {
  const seen = new Set<string>();
  return filterRootCasts(casts)
    .filter((c) => {
      const h = c.hash as string;
      if (!h || seen.has(h)) return false;
      seen.add(h);
      return true;
    })
    .sort((a, b) => castTimestamp(b) - castTimestamp(a));
}

type RootFeedCursorState = {
  c?: string;
  pendingHashes?: string[];
};

function normalizeApiCursor(raw: unknown): string | undefined {
  if (raw == null || raw === "") return undefined;
  return typeof raw === "string" ? raw : JSON.stringify(raw);
}

/** Root feeds: raw Hypersnap cursor, or base64 JSON when overflow hashes are queued. */
function decodeRootFeedCursor(encoded: string | undefined): RootFeedCursorState {
  if (!encoded) return {};
  if (encoded.length > MAX_FEED_CURSOR_BYTES) return {};
  try {
    const parsed = JSON.parse(
      Buffer.from(encoded, "base64url").toString("utf8")
    ) as RootFeedCursorState & Record<string, unknown>;
    if (
      parsed &&
      typeof parsed === "object" &&
      ("pendingHashes" in parsed || ("c" in parsed && !Object.keys(parsed).some((k) => /^\d+$/.test(k))))
    ) {
      return {
        c: typeof parsed.c === "string" ? parsed.c : undefined,
        pendingHashes: Array.isArray(parsed.pendingHashes)
          ? parsed.pendingHashes.map((h) => normalizeCastHash(String(h)))
          : undefined,
      };
    }
  } catch {
    /* legacy opaque Hypersnap cursor */
  }
  return { c: encoded };
}

function encodeRootFeedCursor(state: RootFeedCursorState): string | undefined {
  const pending = state.pendingHashes?.slice(-MAX_PENDING_HASHES_PER_FID);
  if (pending?.length) {
    return Buffer.from(
      JSON.stringify({
        ...(state.c ? { c: state.c } : {}),
        pendingHashes: pending,
      })
    ).toString("base64url");
  }
  return state.c;
}

async function resolvePendingHashes(
  hashes: string[]
): Promise<Record<string, unknown>[]> {
  const unique = [...new Set(hashes.map(normalizeCastHash))].slice(
    0,
    MAX_PENDING_HASHES_PER_FID
  );
  if (unique.length === 0) return [];
  const settled = await Promise.allSettled(unique.map((hash) => fetchCastByHash(hash)));
  return settled
    .filter((r): r is PromiseFulfilledResult<Record<string, unknown>> => r.status === "fulfilled")
    .map((r) => r.value);
}

/**
 * One client "load more" — may walk several Hypersnap pages when replies dominate the batch.
 */
export async function fetchRootCastFeedPage(
  path: string,
  params: Record<string, string | number | undefined>,
  pageSize = DEFAULT_PAGE_LIMIT
): Promise<FeedPage> {
  const incoming = decodeRootFeedCursor(
    typeof params.cursor === "string" ? params.cursor : undefined
  );
  const hsnapLimit = hsnapLimitForPage(pageSize);
  let pool = dedupeSortCasts(await resolvePendingHashes(incoming.pendingHashes ?? []));
  let apiCursor = incoming.c;
  let lastApiNext: string | undefined;

  const maxRounds = 8;
  for (let round = 0; round < maxRounds && pool.length < pageSize; round++) {
    const res = await hsnap<FeedPage>(path, {
      ...params,
      cursor: apiCursor,
      limit: hsnapLimit,
    });
    pool = dedupeSortCasts([...pool, ...filterRootCasts(res.casts ?? [])]);
    lastApiNext = normalizeApiCursor(res.next?.cursor);
    if (!lastApiNext) break;
    apiCursor = lastApiNext;
  }

  const page = capPage(pool, pageSize);
  const remainder = pool.slice(pageSize);
  const pendingHashes = remainder
    .map((c) => (c.hash ? normalizeCastHash(String(c.hash)) : ""))
    .filter(Boolean);

  const nextState: RootFeedCursorState = {};
  if (pendingHashes.length) {
    nextState.pendingHashes = pendingHashes.slice(-MAX_PENDING_HASHES_PER_FID);
  }
  if (lastApiNext) nextState.c = lastApiNext;

  const nextEncoded = encodeRootFeedCursor(nextState);
  const hasMore = page.length > 0 && !!nextEncoded;

  return {
    casts: page,
    next: hasMore ? { cursor: nextEncoded } : { cursor: null },
  };
}

/** Per-user state for multi-user column pagination (includes overflow not yet shown). */
export type MultiUserFidState = {
  c?: string;
  /** Cast hashes fetched but not yet shown — resolved on the server, not stored in URL. */
  pendingHashes?: string[];
};

export type MultiUserCursorState = Record<string, MultiUserFidState>;

function extractPendingHashes(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const hashes: string[] = [];
  for (const item of value) {
    if (typeof item === "string") {
      hashes.push(normalizeCastHash(item));
    } else if (item && typeof item === "object" && (item as { hash?: string }).hash) {
      hashes.push(normalizeCastHash(String((item as { hash: string }).hash)));
    }
  }
  return [...new Set(hashes)];
}

function buildActiveMultiUserState(state: MultiUserCursorState): MultiUserCursorState {
  const active: MultiUserCursorState = {};
  for (const [fid, s] of Object.entries(state)) {
    const pendingHashes = s.pendingHashes?.slice(-MAX_PENDING_HASHES_PER_FID);
    if (s.c || (pendingHashes && pendingHashes.length > 0)) {
      active[fid] = {
        ...(s.c ? { c: s.c } : {}),
        ...(pendingHashes?.length ? { pendingHashes } : {}),
      };
    }
  }
  return active;
}

function encodeMultiUserStatePayload(active: MultiUserCursorState): string | undefined {
  if (Object.keys(active).length === 0) return undefined;
  return Buffer.from(JSON.stringify(active)).toString("base64url");
}

/** Shrink pending overflow before encoding so GET cursor URLs stay under MAX_FEED_CURSOR_BYTES. */
function trimMultiUserStateForCursor(state: MultiUserCursorState): MultiUserCursorState {
  let active = buildActiveMultiUserState(state);
  let encoded = encodeMultiUserStatePayload(active);
  if (!encoded || encoded.length <= MAX_FEED_CURSOR_BYTES) return active;

  const work = { ...active };
  while (encoded && encoded.length > MAX_FEED_CURSOR_BYTES) {
    let trimmed = false;
    let maxFid: string | null = null;
    let maxLen = 0;
    for (const [fid, s] of Object.entries(work)) {
      const n = s.pendingHashes?.length ?? 0;
      if (n > maxLen) {
        maxLen = n;
        maxFid = fid;
      }
    }
    if (maxFid && maxLen > 0) {
      const pending = [...(work[maxFid]!.pendingHashes ?? [])];
      pending.pop();
      work[maxFid] = {
        ...(work[maxFid]!.c ? { c: work[maxFid]!.c } : {}),
        ...(pending.length ? { pendingHashes: pending } : {}),
      };
      trimmed = true;
    }
    if (!trimmed) break;
    active = buildActiveMultiUserState(work);
    encoded = encodeMultiUserStatePayload(active);
  }
  return active;
}

export function encodeMultiUserCursor(state: MultiUserCursorState): string | undefined {
  const active = trimMultiUserStateForCursor(state);
  return encodeMultiUserStatePayload(active);
}

export function decodeMultiUserCursor(encoded: string | undefined): MultiUserCursorState {
  if (!encoded) return {};
  // Legacy / oversized cursors broke fetch() URL limits — drop them.
  if (encoded.length > MAX_FEED_CURSOR_BYTES) return {};
  try {
    const parsed = JSON.parse(
      Buffer.from(encoded, "base64url").toString("utf8")
    ) as Record<string, unknown>;
    const out: MultiUserCursorState = {};
    for (const [k, v] of Object.entries(parsed)) {
      if (typeof v === "string") {
        out[k] = { c: v };
      } else if (v && typeof v === "object") {
        const o = v as MultiUserFidState & { pending?: unknown };
        const pendingHashes = o.pendingHashes?.length
          ? o.pendingHashes.map((h) => normalizeCastHash(h))
          : extractPendingHashes(o.pending);
        out[k] = {
          ...(o.c ? { c: o.c } : {}),
          ...(pendingHashes.length
            ? { pendingHashes: pendingHashes.slice(-MAX_PENDING_HASHES_PER_FID) }
            : {}),
        };
      }
    }
    return out;
  } catch {
    return {};
  }
}

async function resolvePendingCasts(
  states: MultiUserCursorState,
  fids: number[]
): Promise<Record<string, unknown>[]> {
  const hashes = [
    ...new Set(
      fids.flatMap((fid) => states[String(fid)]?.pendingHashes ?? []).map(normalizeCastHash)
    ),
  ].slice(0, MAX_PENDING_HASHES_PER_FID * fids.length);

  if (hashes.length === 0) return [];

  const settled = await Promise.allSettled(
    hashes.map((hash) => fetchCastByHash(hash))
  );
  return settled
    .filter((r): r is PromiseFulfilledResult<Record<string, unknown>> => r.status === "fulfilled")
    .map((r) => r.value);
}

/**
 * Multi-user column: same per-user fetch depth as Home, merge by time, return top N.
 * Overflow is stored in the cursor so casts are not skipped when one user is busy.
 */
export async function fetchMultiUserRootCastPage(
  fids: number[],
  encodedCursor: string | undefined,
  pageSize = DEFAULT_PAGE_LIMIT
): Promise<FeedPage> {
  const states = decodeMultiUserCursor(encodedCursor);
  const hsnapLimit = hsnapLimitForPage(pageSize);

  let pool = dedupeSortCasts(await resolvePendingCasts(states, fids));

  const nextStates: MultiUserCursorState = {};
  const fidCursors: Record<string, string | undefined> = {};
  const fidExhausted = new Set<string>();

  for (const fid of fids) {
    fidCursors[String(fid)] = states[String(fid)]?.c;
  }

  if (pool.length < pageSize) {
    const maxRounds = 8;
    for (let round = 0; round < maxRounds && pool.length < pageSize; round++) {
      const activeFids = fids.filter((fid) => !fidExhausted.has(String(fid)));
      if (activeFids.length === 0) break;

      const settled = await Promise.allSettled(
        activeFids.map(async (fid) => {
          const key = String(fid);
          const res = await hsnap<FeedPage>("/v2/farcaster/feed/user/casts", {
            fid,
            cursor: fidCursors[key],
            limit: hsnapLimit,
          });
          return {
            fid,
            roots: filterRootCasts(res.casts ?? []),
            apiNext: normalizeApiCursor(res.next?.cursor),
          };
        })
      );

      for (const r of settled) {
        if (r.status !== "fulfilled") continue;
        const key = String(r.value.fid);
        pool = dedupeSortCasts([...pool, ...r.value.roots]);
        if (r.value.apiNext) {
          fidCursors[key] = r.value.apiNext;
          nextStates[key] = { c: r.value.apiNext };
        } else {
          fidExhausted.add(key);
        }
      }
    }
  } else {
    // Enough overflow from last page — drain pending before fetching again
    for (const fid of fids) {
      const prev = states[String(fid)] ?? {};
      if (prev.c) nextStates[String(fid)] = { c: prev.c };
    }
  }

  const page = capPage(pool, pageSize);
  const remainder = pool.slice(pageSize);

  for (const cast of remainder) {
    const fid = authorFid(cast);
    const hash = cast.hash as string | undefined;
    if (fid == null || !hash) continue;
    const key = String(fid);
    const prev = states[key] ?? {};
    if (!nextStates[key]) {
      // Do not copy prev.pendingHashes — they were already resolved into pool this request.
      nextStates[key] = prev.c ? { c: prev.c } : {};
    }
    const pendingHashes = [...(nextStates[key].pendingHashes ?? []), normalizeCastHash(hash)];
    nextStates[key].pendingHashes = pendingHashes.slice(-MAX_PENDING_HASHES_PER_FID);
  }

  const nextEncoded = encodeMultiUserCursor(nextStates);
  const hasMore = page.length > 0 && !!nextEncoded;
  return {
    casts: page,
    next: hasMore ? { cursor: nextEncoded } : { cursor: null },
  };
}

interface SearchResponse {
  casts: Record<string, unknown>[];
  next?: { cursor?: string | null };
}

/** Keyword column — same page cap; multi-query uses full fetch depth per term. */
export async function fetchKeywordRootCastPage(
  queries: string[],
  cursor: string | undefined,
  pageSize = DEFAULT_PAGE_LIMIT
): Promise<FeedPage> {
  if (queries.length === 1) {
    const res = await hsnap<SearchResponse>("/v2/farcaster/cast/search", {
      q: queries[0],
      limit: hsnapLimitForPage(pageSize),
      cursor,
    });
    const roots = filterRootCasts(res.casts ?? []);
    return {
      casts: capPage(roots, pageSize),
      next: res.next,
    };
  }

  const hsnapLimit = hsnapLimitForPage(pageSize);

  const results = await Promise.all(
    queries.map((q) =>
      hsnap<SearchResponse>("/v2/farcaster/cast/search", {
        q,
        limit: hsnapLimit,
      })
    )
  );

  const page = capPage(
    dedupeSortCasts(results.flatMap((r) => r.casts ?? [])),
    pageSize
  );

  return {
    casts: page,
    next: { cursor: null },
  };
}
