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
    if (isHypersnapError(err) && err.status === 404) return null;
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
  if (!n) return null;

  const paths = [
    "/v2/farcaster/user/by-username",
    "/v2/farcaster/user/by_username",
  ] as const;

  for (const path of paths) {
    try {
      const data = await hsnap<{ user: HsnapUser }>(path, { username: n });
      if (data.user?.fid) return data.user;
    } catch (err: unknown) {
      if (isHypersnapError(err) && err.status === 404) continue;
      throw err;
    }
  }

  return lookupUserByUsernameProof(n);
}

function rankUsers(query: string, users: HsnapUser[]): HsnapUser[] {
  const q = normalizeUsernameQuery(query).toLowerCase();
  const exact = users.filter((u) => u.username.toLowerCase() === q);
  const seen = new Set<number>();
  const out: HsnapUser[] = [];
  for (const u of exact) {
    if (!seen.has(u.fid)) {
      out.push(u);
      seen.add(u.fid);
    }
  }
  for (const u of users) {
    if (!seen.has(u.fid)) {
      out.push(u);
      seen.add(u.fid);
    }
  }
  return out;
}

export async function lookupUserByFid(fid: number): Promise<HsnapUser | null> {
  if (!Number.isFinite(fid) || fid <= 0) return null;
  try {
    const data = await hsnap<{ user: HsnapUser }>("/v2/farcaster/user", { fid });
    return data.user?.fid ? data.user : null;
  } catch (err: unknown) {
    if (isHypersnapError(err) && err.status === 404) return null;
    throw err;
  }
}

/** Verified ETH addresses + custody address reverse lookup. */
export async function lookupUsersByEthAddress(address: string): Promise<HsnapUser[]> {
  const trimmed = address.trim();
  if (!/^0x[a-fA-F0-9]{40}$/i.test(trimmed)) return [];

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
        if (isHypersnapError(err) && err.status === 404) return;
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
        if (isHypersnapError(err) && err.status === 404) return;
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
    if (isHypersnapError(err) && err.status === 404) return null;
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
export async function searchUsersProfile(q: string, limit = 25): Promise<HsnapUser[]> {
  const trimmed = q.trim();
  if (!trimmed) return [];

  const tasks: Promise<HsnapUser[]>[] = [searchUsersCombined(trimmed, limit)];

  if (/^\d+$/.test(trimmed)) {
    tasks.push(
      lookupUserByFid(Number(trimmed)).then((u) => (u ? [u] : []))
    );
  }

  if (/^0x[a-fA-F0-9]{40}$/i.test(trimmed)) {
    tasks.push(lookupUsersByEthAddress(trimmed));
  }

  tasks.push(
    lookupUserByXUsername(trimmed).then((u) => (u ? [u] : []))
  );

  const groups = await Promise.all(tasks);
  return rankUsers(trimmed, mergeUsers(...groups)).slice(0, limit);
}

/** Prefix search + exact by-username + username-proof fallback for ENS. */
export async function searchUsersCombined(
  q: string,
  limit = 25
): Promise<HsnapUser[]> {
  const trimmed = normalizeUsernameQuery(q);
  if (!trimmed) return [];

  const byFid = new Map<number, HsnapUser>();

  const [fuzzy, exact] = await Promise.all([
    searchUsersFuzzy(trimmed, limit).catch(() => [] as HsnapUser[]),
    lookupUserByUsername(trimmed),
  ]);

  // Drop fuzzy hits that don't match an explicit .eth query (avoids marcgarcia vs marcgarcia.eth)
  for (const u of fuzzy) {
    if (trimmed.toLowerCase().endsWith(".eth")) {
      if (usernameMatchesQuery(trimmed, u.username)) byFid.set(u.fid, u);
    } else {
      byFid.set(u.fid, u);
    }
  }
  if (exact) byFid.set(exact.fid, exact);

  return rankUsers(trimmed, [...byFid.values()]).slice(0, limit);
}
