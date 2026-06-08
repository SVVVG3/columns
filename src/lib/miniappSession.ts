/**
 * In-memory + sessionStorage cache for the mini app viewer session.
 * Shared across page navigations so we don't re-fetch on every mount.
 */
import type { SessionUser } from "@/types";

const TTL_MS = 5 * 60_000; // 5 minutes
const KEY = "miniapp_viewer";

interface Cached {
  viewer: SessionUser;
  allowed: boolean;
  ts: number;
}

let memCache: Cached | null = null;

function read(): Cached | null {
  if (memCache && Date.now() - memCache.ts < TTL_MS) return memCache;
  try {
    const raw = sessionStorage.getItem(KEY);
    if (raw) {
      const data = JSON.parse(raw) as Cached;
      if (Date.now() - data.ts < TTL_MS) {
        memCache = data;
        return data;
      }
    }
  } catch {
    /* sessionStorage not available (SSR) */
  }
  return null;
}

function write(viewer: SessionUser, allowed: boolean) {
  const entry: Cached = { viewer, allowed, ts: Date.now() };
  memCache = entry;
  try {
    sessionStorage.setItem(KEY, JSON.stringify(entry));
  } catch {
    /* ignore */
  }
}

function clear() {
  memCache = null;
  try {
    sessionStorage.removeItem(KEY);
  } catch {
    /* ignore */
  }
}

export const miniappSession = { read, write, clear };
