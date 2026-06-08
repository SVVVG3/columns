import { hsnap } from "@/lib/hypersnap";
import { normalizeProfileDetails, type ProfileDetails } from "@/lib/profilePreview";
import { extractProfileBio, resolveProfileBio } from "@/lib/profileBio";
import { buildProfileLinks } from "@/lib/profileLinks";
import { bannerFromProfile, bannerFromUserDataMessages } from "@/lib/userBanner";
import {
  fetchUserDataMessages,
  profileUserDataFieldsFromMessages,
} from "@/lib/userProfileData";
import { lookupUserByUsername } from "@/lib/userSearch";

async function enrichProfile(
  raw: unknown,
  fid: number
): Promise<ProfileDetails | null> {
  const base = normalizeProfileDetails(raw);
  if (!base) return null;
  const row = raw as Record<string, unknown>;
  const profileObj = row.profile as Record<string, unknown> | undefined;
  const verifiedAccounts = row.verified_accounts as unknown[] | undefined;

  const bioFromV2 = extractProfileBio(raw);
  const bannerFromV2 = bannerFromProfile(profileObj);

  let userDataMessages: Awaited<ReturnType<typeof fetchUserDataMessages>> = [];
  if (!bioFromV2 || !bannerFromV2) {
    userDataMessages = await fetchUserDataMessages(fid);
  }

  const [bio, bannerUrl] = await Promise.all([
    bioFromV2
      ? Promise.resolve(bioFromV2)
      : resolveProfileBio(raw, fid, userDataMessages),
    bannerFromV2
      ? Promise.resolve(bannerFromV2)
      : Promise.resolve(bannerFromUserDataMessages(userDataMessages)),
  ]);

  const profileLinks = buildProfileLinks(
    profileObj,
    verifiedAccounts,
    profileUserDataFieldsFromMessages(userDataMessages)
  );

  return {
    ...base,
    bio: bio?.trim() || base.bio,
    ...(bannerUrl ? { bannerUrl } : {}),
    profileLinks,
  };
}

export async function fetchPublicProfileByFid(
  fid: number
): Promise<ProfileDetails | null> {
  const data = await hsnap<{ user: unknown }>("/v2/farcaster/user", {
    fid: String(fid),
  });
  return enrichProfile(data.user, fid);
}

export async function fetchPublicProfileByUsername(
  username: string
): Promise<ProfileDetails | null> {
  const found = await lookupUserByUsername(username.replace(/^@/, "").trim());
  if (!found?.fid) return null;
  return fetchPublicProfileByFid(found.fid);
}
