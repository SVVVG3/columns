/** Minimal user info to open the profile preview (from cast author, notification actor, etc.). */
export interface ProfilePreviewSeed {
  fid?: number;
  username: string;
  displayName?: string;
  pfpUrl?: string;
}

/** Full profile returned from /api/user/profile. */
export interface ProfileDetails extends ProfilePreviewSeed {
  fid: number;
  username: string;
  displayName: string;
  pfpUrl?: string;
  bio?: string;
  followerCount?: number;
  followingCount?: number;
}

export function farcasterProfileUrl(username: string | undefined | null): string | null {
  if (!username || typeof username !== "string") return null;
  const clean = username.replace(/^@/, "").trim();
  return clean ? `https://farcaster.xyz/${clean}` : null;
}

/** Build a preview seed from Hypersnap/Neynar-shaped user objects. */
export function profileSeedFromUnknown(value: unknown): ProfilePreviewSeed | null {
  if (!value || typeof value !== "object") return null;
  const u = value as Record<string, unknown>;
  const username = typeof u.username === "string" ? u.username.replace(/^@/, "").trim() : "";
  if (!username) return null;
  const fid = typeof u.fid === "number" ? u.fid : undefined;
  const displayName =
    (typeof u.display_name === "string" && u.display_name) ||
    (typeof u.displayName === "string" && u.displayName) ||
    username;
  const pfpUrl =
    (typeof u.pfp_url === "string" && u.pfp_url) ||
    (typeof u.pfpUrl === "string" && u.pfpUrl) ||
    undefined;
  return { fid, username, displayName, pfpUrl };
}

export function normalizeProfileDetails(raw: unknown): ProfileDetails | null {
  const seed = profileSeedFromUnknown(raw);
  if (!seed?.username) return null;
  const u = raw as Record<string, unknown>;
  const fid = typeof u.fid === "number" ? u.fid : seed.fid;
  if (fid == null) return null;

  const profile = u.profile as Record<string, unknown> | undefined;
  const bioObj = profile?.bio as Record<string, unknown> | undefined;
  const bio =
    (typeof bioObj?.text === "string" && bioObj.text) ||
    (typeof u.bio === "string" && u.bio) ||
    undefined;

  return {
    fid,
    username: seed.username,
    displayName: seed.displayName ?? seed.username,
    pfpUrl: seed.pfpUrl,
    bio: bio?.trim() || undefined,
    followerCount: typeof u.follower_count === "number" ? u.follower_count : undefined,
    followingCount: typeof u.following_count === "number" ? u.following_count : undefined,
  };
}

export function formatProfileCount(n: number | undefined): string | null {
  if (n == null || Number.isNaN(n)) return null;
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`;
  return String(n);
}
