/**
 * Simple in-memory feed cache with TTL.
 *
 * This lives in the Node.js process. For a single server it works well.
 * When you scale to multiple instances, swap the Map for a Redis client:
 *   - Replace getCached / setCached with redis.get / redis.setex
 *   - The call sites don't need to change at all.
 *
 * Cache key convention: `${userFid}:${pathname}${search}`
 * Including userFid ensures different users never share viewer-contextual data
 * (liked state, personalised feeds, etc.)
 */

interface CacheEntry {
  data: unknown;
  expiresAt: number;
}

const store = new Map<string, CacheEntry>();

/** Max entries before we start evicting the oldest. Keeps memory bounded. */
const MAX_ENTRIES = 2000;

/** `undefined` = miss; stored value may be `null` (e.g. cast not found). */
export function getCached(key: string): unknown | undefined {
  const entry = store.get(key);
  if (!entry) return undefined;
  if (Date.now() > entry.expiresAt) {
    store.delete(key);
    return undefined;
  }
  return entry.data;
}

export function setCached(key: string, data: unknown, ttlMs: number): void {
  if (store.size >= MAX_ENTRIES) {
    // Evict the oldest entry (Map preserves insertion order)
    const firstKey = store.keys().next().value;
    if (firstKey !== undefined) store.delete(firstKey);
  }
  store.set(key, { data, expiresAt: Date.now() + ttlMs });
}

/** Remove a single entry from the cache (e.g. after a mutation). */
export function deleteCached(key: string): void {
  store.delete(key);
}

/** Bust feed list caches after the viewer publishes a cast (so columns pick it up immediately). */
export function invalidateFeedCaches(viewerFid: number): void {
  for (const key of store.keys()) {
    if (
      key.startsWith(`${viewerFid}:home:`) ||
      key.startsWith("user:root:") ||
      key.startsWith("trending:") ||
      key.startsWith("channel:") ||
      key.startsWith("keyword:")
    ) {
      store.delete(key);
    }
  }
}

/**
 * Wraps an async data-fetcher with cache read-through logic.
 *
 * @param key   Unique cache key (include userFid + all query params)
 * @param ttlMs How long to cache the result in milliseconds
 * @param fn    Async function that fetches fresh data if cache misses
 */
export async function withCache<T>(
  key: string,
  ttlMs: number,
  fn: () => Promise<T>
): Promise<T> {
  const cached = getCached(key);
  if (cached !== undefined) return cached as T;
  const data = await fn();
  setCached(key, data, ttlMs);
  return data;
}
