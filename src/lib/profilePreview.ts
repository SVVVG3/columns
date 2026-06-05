import { extractProfileBio } from "@/lib/profileBio";
import { buildProfileLinks, type ProfileLink } from "@/lib/profileLinks";
import { buildProfileWallets, type ProfileWallet } from "@/lib/profileWallets";

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
  registeredAt?: string;
  bannerUrl?: string;
  wallets: ProfileWallet[];
  profileLinks: ProfileLink[];
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

function parseVerifiedAddresses(value: unknown) {
  if (!value || typeof value !== "object") return undefined;
  const va = value as Record<string, unknown>;
  const primary = va.primary as Record<string, unknown> | undefined;
  return {
    eth_addresses: Array.isArray(va.eth_addresses)
      ? (va.eth_addresses as string[])
      : undefined,
    sol_addresses: Array.isArray(va.sol_addresses)
      ? (va.sol_addresses as string[])
      : undefined,
    primary: primary
      ? {
          eth_address:
            typeof primary.eth_address === "string" ? primary.eth_address : undefined,
          sol_address:
            typeof primary.sol_address === "string" ? primary.sol_address : undefined,
        }
      : undefined,
  };
}

export function normalizeProfileDetails(raw: unknown): ProfileDetails | null {
  const seed = profileSeedFromUnknown(raw);
  if (!seed?.username) return null;
  const u = raw as Record<string, unknown>;
  const fid = typeof u.fid === "number" ? u.fid : seed.fid;
  if (fid == null) return null;

  const profile = u.profile as Record<string, unknown> | undefined;
  const bio = extractProfileBio(u);

  const custodyAddress =
    typeof u.custody_address === "string" ? u.custody_address : undefined;
  const registeredAt =
    typeof u.registered_at === "string" ? u.registered_at : undefined;
  const verifiedAccounts = Array.isArray(u.verified_accounts)
    ? u.verified_accounts
    : undefined;

  const wallets = buildProfileWallets({
    custodyAddress,
    verifiedAddresses: parseVerifiedAddresses(u.verified_addresses),
  });
  const profileLinks = buildProfileLinks(profile, verifiedAccounts, undefined);

  return {
    fid,
    username: seed.username,
    displayName: seed.displayName ?? seed.username,
    pfpUrl: seed.pfpUrl,
    bio: bio?.trim() || undefined,
    followerCount: typeof u.follower_count === "number" ? u.follower_count : undefined,
    followingCount: typeof u.following_count === "number" ? u.following_count : undefined,
    registeredAt,
    wallets,
    profileLinks,
  };
}

export function formatProfileCount(n: number | undefined): string | null {
  if (n == null || Number.isNaN(n)) return null;
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`;
  return String(n);
}

export function formatProfileJoinedDate(iso: string | undefined): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString("en-US", { month: "short", year: "numeric" });
}
