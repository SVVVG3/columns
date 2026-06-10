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

/** Neynar prefix search — much better username suggestions than Hypersnap fuzzy alone. */
export async function searchUsersNeynar(
  q: string,
  limit: number,
  viewerFid?: number
): Promise<HsnapUser[]> {
  const apiKey = process.env.NEYNAR_API_KEY?.trim();
  if (!apiKey) return [];

  const trimmed = normalizeUsernameQuery(q);
  if (!trimmed || trimmed.length < 2) return [];

  try {
    const url = new URL("https://api.neynar.com/v2/farcaster/user/search");
    url.searchParams.set("q", trimmed);
    url.searchParams.set("limit", String(Math.min(limit, 25)));
    if (viewerFid) url.searchParams.set("viewer_fid", String(viewerFid));

    const res = await fetch(url.toString(), {
      headers: { "x-api-key": apiKey, Accept: "application/json" },
    });
    if (!res.ok) return [];

    const data = (await res.json()) as {
      users?: Array<{
        fid?: number;
        username?: string;
        display_name?: string;
        pfp_url?: string;
      }>;
      result?: {
        users?: Array<{
          fid?: number;
          username?: string;
          display_name?: string;
          pfp_url?: string;
        }>;
      };
    };

    const rows = data.users ?? data.result?.users ?? [];
    return rows
      .filter((u) => u.fid && u.username)
      .map((u) => ({
        fid: u.fid!,
        username: u.username!,
        display_name: u.display_name,
        pfp_url: u.pfp_url,
      }));
  } catch {
    return [];
  }
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

/** Prefix search + Neynar suggestions + exact by-username + username-proof fallback for ENS. */
export async function searchUsersCombined(
  q: string,
  limit = 25,
  viewerFid?: number
): Promise<HsnapUser[]> {
  const trimmed = normalizeUsernameQuery(q);
  if (!trimmed) return [];

  const byFid = new Map<number, HsnapUser>();

  const [fuzzy, exact, neynar] = await Promise.all([
    searchUsersFuzzy(trimmed, limit).catch(() => [] as HsnapUser[]),
    lookupUserByUsername(trimmed).catch(() => null),
    searchUsersNeynar(trimmed, limit, viewerFid).catch(() => [] as HsnapUser[]),
  ]);

  // Neynar already returns strong prefix matches — always merge those first.
  for (const u of neynar) byFid.set(u.fid, u);

  for (const u of fuzzy) {
    const score = userSearchScore(trimmed, u);
    if (trimmed.toLowerCase().endsWith(".eth")) {
      if (usernameMatchesQuery(trimmed, u.username) || score >= 550) byFid.set(u.fid, u);
    } else if (score >= 550) {
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
