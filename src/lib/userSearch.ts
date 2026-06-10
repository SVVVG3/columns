import { hsnap, isHypersnapError } from "@/lib/hypersnap";

export interface HsnapUser {
  fid: number;
  username: string;
  display_name?: string;
  pfp_url?: string;
}

interface UsernameProof {
  fid: number;
  name: string;
  type?: string;
}

/** Strip leading @; preserve case (Hypersnap by-username is case-sensitive). */
export function normalizeUsernameQuery(q: string): string {
  return q.replace(/^@/, "").trim();
}

export function isEthAddressQuery(q: string): boolean {
  return /^0x[a-fA-F0-9]{40}$/i.test(q.trim());
}

export function isFidQuery(q: string): boolean {
  return /^\d+$/.test(q.trim());
}

/** Username / ENS prefix search — not for wallet or FID-only queries. */
export function shouldRunUsernameSearch(q: string): boolean {
  const t = q.trim();
  if (!t || isEthAddressQuery(t) || isFidQuery(t)) return false;
  return true;
}

/** X handle lookup — skip wallet-shaped and dotted ENS-style queries. */
export function shouldRunXSearch(q: string): boolean {
  const t = q.trim().replace(/^@/, "");
  if (!t || isEthAddressQuery(t) || isFidQuery(t)) return false;
  if (t.includes(".")) return false;
  return /^[a-zA-Z0-9_]{1,50}$/.test(t);
}

/** Hypersnap often returns proof/X misses as non-404 errors with a NotFound body. */
function isLookupMiss(err: unknown): boolean {
  if (!isHypersnapError(err)) return false;
  if (err.status === 404 || err.status === 400) return true;
  const msg = err.message.toLowerCase();
  return (
    msg.includes("not found") ||
    msg.includes("notfound") ||
    msg.includes("username proof not found")
  );
}

async function safeUserSearchTask(
  fn: () => Promise<HsnapUser[]>
): Promise<HsnapUser[]> {
  try {
    return await fn();
  } catch {
    return [];
  }
}

/** True when the resolved profile username matches what the user typed. */
export function usernameMatchesQuery(query: string, username: string): boolean {
  const q = normalizeUsernameQuery(query).toLowerCase();
  return username.toLowerCase() === q;
}

export async function searchUsersFuzzy(q: string, limit: number): Promise<HsnapUser[]> {
  const data = await hsnap<{ users: HsnapUser[] }>("/v2/farcaster/user/search", {
    q,
    limit,
  });
  return data.users ?? [];
}

/** Snapchain username-proof index (ENS, fnames) → FID, then full user profile. */
export async function lookupUserByUsernameProof(
  name: string
): Promise<HsnapUser | null> {
  const n = normalizeUsernameQuery(name);
  if (!n) return null;
  try {
    const proof = await hsnap<UsernameProof>("/v1/userNameProofByName", { name: n });
    if (!proof?.fid) return null;
    const data = await hsnap<{ user: HsnapUser }>("/v2/farcaster/user", {
      fid: proof.fid,
    });
    return data.user?.fid ? data.user : null;
  } catch (err: unknown) {
    if (isLookupMiss(err)) return null;
    throw err;
  }
}

/**
 * Exact username lookup per Hypersnap docs:
 * GET /v2/farcaster/user/by-username (also /by_username).
 * Falls back to /v1/userNameProofByName when the v2 reverse index misses ENS names.
 */
export async function lookupUserByUsername(
  username: string
): Promise<HsnapUser | null> {
  const n = normalizeUsernameQuery(username);
  if (!n || isEthAddressQuery(n) || isFidQuery(n)) return null;

  const paths = [
    "/v2/farcaster/user/by-username",
    "/v2/farcaster/user/by_username",
  ] as const;

  for (const path of paths) {
    try {
      const data = await hsnap<{ user: HsnapUser }>(path, { username: n });
      if (data.user?.fid) return data.user;
    } catch (err: unknown) {
      if (isLookupMiss(err)) continue;
      throw err;
    }
  }

  return lookupUserByUsernameProof(n);
}

function usernameLocalPart(username: string): string {
  return username.split(".")[0].toLowerCase();
}

/** True when query matches username stem, full handle, or display name. */
export function matchesUsernamePrefix(query: string, user: HsnapUser): boolean {
  const q = normalizeUsernameQuery(query).toLowerCase();
  if (!q) return false;
  const username = user.username.toLowerCase();
  const local = usernameLocalPart(user.username);
  const display = (user.display_name ?? "").toLowerCase();
  return (
    username.startsWith(q) ||
    local.startsWith(q) ||
    username.includes(q) ||
    local.includes(q) ||
    display.startsWith(q) ||
    display.includes(q)
  );
}

/** Higher = better match for prefix / substring username search. */
export function userSearchScore(query: string, user: HsnapUser): number {
  const q = normalizeUsernameQuery(query).toLowerCase();
  if (!q) return 0;
  const username = user.username.toLowerCase();
  const local = usernameLocalPart(user.username);
  const display = (user.display_name ?? "").toLowerCase();

  if (username === q) return 1000;
  if (local === q) return 950;
  if (username.startsWith(q)) return 900;
  if (local.startsWith(q)) return 850;
  if (username.includes(q)) return 600;
  if (local.includes(q)) return 550;
  if (display.startsWith(q)) return 400;
  if (display.includes(q)) return 300;
  return 100;
}

function rankUsers(query: string, users: HsnapUser[]): HsnapUser[] {
  const seen = new Set<number>();
  const out: HsnapUser[] = [];
  const sorted = [...users].sort(
    (a, b) => userSearchScore(query, b) - userSearchScore(query, a)
  );
  for (const u of sorted) {
    if (!seen.has(u.fid)) {
      out.push(u);
      seen.add(u.fid);
    }
  }
  return out;
}

/** Include the signed-in user when their handle matches the typed prefix. */
async function lookupViewerIfPrefixMatch(
  viewerFid: number,
  q: string
): Promise<HsnapUser | null> {
  const user = await lookupUserByFid(viewerFid);
  if (!user) return null;
  return matchesUsernamePrefix(q, user) ? user : null;
}

/**
 * Hypersnap fname search often needs a near-complete stem for ENS handles.
 * Supplement with a prefix scan of the viewer's following list (local filter).
 */
async function searchFollowingByPrefix(
  viewerFid: number,
  q: string,
  limit: number
): Promise<HsnapUser[]> {
  const trimmed = normalizeUsernameQuery(q);
  if (!trimmed || trimmed.length < 2) return [];

  const out: HsnapUser[] = [];
  const seen = new Set<number>();
  let cursor: string | undefined;

  for (let page = 0; page < 3 && out.length < limit; page++) {
    const params: Record<string, string | number> = {
      fid: viewerFid,
      limit: 100,
    };
    if (cursor) params.cursor = cursor;

    const data = await hsnap<{
      users?: HsnapUser[];
      next?: { cursor?: string | null };
    }>("/v2/farcaster/following", params);

    for (const u of data.users ?? []) {
      if (!u.fid || seen.has(u.fid)) continue;
      if (!matchesUsernamePrefix(trimmed, u)) continue;
      seen.add(u.fid);
      out.push(u);
      if (out.length >= limit) break;
    }

    cursor = data.next?.cursor ?? undefined;
    if (!cursor) break;
  }

  return out;
}

export async function lookupUserByFid(fid: number): Promise<HsnapUser | null> {
  if (!Number.isFinite(fid) || fid <= 0) return null;
  try {
    const data = await hsnap<{ user: HsnapUser }>("/v2/farcaster/user", { fid });
    return data.user?.fid ? data.user : null;
  } catch (err: unknown) {
    if (isLookupMiss(err)) return null;
    throw err;
  }
}

/** Verified ETH addresses + custody address reverse lookup. */
export async function lookupUsersByEthAddress(address: string): Promise<HsnapUser[]> {
  const trimmed = address.trim();
  if (!isEthAddressQuery(trimmed)) return [];

  const seen = new Set<number>();
  const out: HsnapUser[] = [];
  const add = (u: HsnapUser | null | undefined) => {
    if (u?.fid && !seen.has(u.fid)) {
      seen.add(u.fid);
      out.push(u);
    }
  };

  await Promise.all([
    (async () => {
      try {
        const data = await hsnap<{ users: HsnapUser[] }>(
          "/v2/farcaster/user/bulk-by-address",
          { addresses: trimmed }
        );
        for (const u of data.users ?? []) add(u);
      } catch (err: unknown) {
        if (isLookupMiss(err)) return;
        throw err;
      }
    })(),
    (async () => {
      try {
        const data = await hsnap<{ user: HsnapUser }>(
          "/v2/farcaster/user/custody-address",
          { custody_address: trimmed }
        );
        add(data.user);
      } catch (err: unknown) {
        if (isLookupMiss(err)) return;
        throw err;
      }
    })(),
  ]);

  return out;
}

export async function lookupUserByXUsername(username: string): Promise<HsnapUser | null> {
  const n = username.replace(/^@/, "").trim();
  if (!n) return null;
  try {
    const data = await hsnap<{ user: HsnapUser }>("/v2/farcaster/user/by_x_username", {
      username: n,
    });
    return data.user?.fid ? data.user : null;
  } catch (err: unknown) {
    if (isLookupMiss(err)) return null;
    throw err;
  }
}

function mergeUsers(...groups: (HsnapUser | null | undefined)[][]): HsnapUser[] {
  const byFid = new Map<number, HsnapUser>();
  for (const group of groups) {
    for (const u of group) {
      if (u?.fid) byFid.set(u.fid, u);
    }
  }
  return [...byFid.values()];
}

/**
 * Profile search: username prefix, FID, ETH (verified + custody), and X handle.
 */
export async function searchUsersProfile(
  q: string,
  limit = 25,
  viewerFid?: number
): Promise<HsnapUser[]> {
  const trimmed = q.trim();
  if (!trimmed) return [];

  const tasks: Promise<HsnapUser[]>[] = [];

  if (shouldRunUsernameSearch(trimmed)) {
    tasks.push(safeUserSearchTask(() => searchUsersCombined(trimmed, limit, viewerFid)));
  }

  if (isFidQuery(trimmed)) {
    tasks.push(
      safeUserSearchTask(() =>
        lookupUserByFid(Number(trimmed)).then((u) => (u ? [u] : []))
      )
    );
  }

  if (isEthAddressQuery(trimmed)) {
    tasks.push(safeUserSearchTask(() => lookupUsersByEthAddress(trimmed)));
  }

  if (shouldRunXSearch(trimmed)) {
    tasks.push(
      safeUserSearchTask(() =>
        lookupUserByXUsername(trimmed).then((u) => (u ? [u] : []))
      )
    );
  }

  if (tasks.length === 0) return [];

  const groups = await Promise.all(tasks);
  return rankUsers(trimmed, mergeUsers(...groups)).slice(0, limit);
}

/** Hypersnap-only: fuzzy search, exact lookups, following prefix scan, viewer self-match. */
export async function searchUsersCombined(
  q: string,
  limit = 25,
  viewerFid?: number
): Promise<HsnapUser[]> {
  const trimmed = normalizeUsernameQuery(q);
  if (!trimmed) return [];

  const byFid = new Map<number, HsnapUser>();
  const fuzzyLimit = Math.min(Math.max(limit, 25), 50);

  const [fuzzy, exact, viewerMatch, followingMatches] = await Promise.all([
    searchUsersFuzzy(trimmed, fuzzyLimit).catch(() => [] as HsnapUser[]),
    lookupUserByUsername(trimmed).catch(() => null),
    viewerFid
      ? lookupViewerIfPrefixMatch(viewerFid, trimmed).catch(() => null)
      : Promise.resolve(null),
    viewerFid
      ? searchFollowingByPrefix(viewerFid, trimmed, limit).catch(() => [] as HsnapUser[])
      : Promise.resolve([] as HsnapUser[]),
  ]);

  for (const u of followingMatches) byFid.set(u.fid, u);
  if (viewerMatch) byFid.set(viewerMatch.fid, viewerMatch);

  for (const u of fuzzy) {
    if (trimmed.toLowerCase().endsWith(".eth")) {
      if (usernameMatchesQuery(trimmed, u.username)) byFid.set(u.fid, u);
    } else {
      byFid.set(u.fid, u);
    }
  }
  if (exact) byFid.set(exact.fid, exact);

  // Typed handle without .eth — resolve exact fname/ENS (e.g. "svvvg3" → svvvg3.eth).
  if (!trimmed.includes(".") && trimmed.length >= 2) {
    const ensGuess = await lookupUserByUsernameProof(`${trimmed}.eth`).catch(() => null);
    if (ensGuess) byFid.set(ensGuess.fid, ensGuess);
  }

  return rankUsers(trimmed, [...byFid.values()]).slice(0, limit);
}
