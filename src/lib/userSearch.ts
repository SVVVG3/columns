import { hsnap } from "@/lib/hypersnap";

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
  } catch {
    return null;
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
    } catch {
      // try next path / proof fallback
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
