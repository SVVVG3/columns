import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { withCache } from "@/lib/feedCache";
import { hsnap, apiErrorFromHypersnap } from "@/lib/hypersnap";
import { normalizeProfileDetails, type ProfileDetails } from "@/lib/profilePreview";
import { extractProfileBio, resolveProfileBio } from "@/lib/profileBio";
import { buildProfileLinks } from "@/lib/profileLinks";
import { bannerFromProfile, bannerFromUserDataMessages } from "@/lib/userBanner";
import {
  fetchUserDataMessages,
  profileUserDataFieldsFromMessages,
} from "@/lib/userProfileData";
import { lookupUserByUsername } from "@/lib/userSearch";

const TTL = 60_000;

function profileNeedsUserData(
  raw: Record<string, unknown>,
  profileObj: Record<string, unknown> | undefined,
  verifiedAccounts: unknown[] | undefined
): boolean {
  if (!extractProfileBio(raw)) return true;
  if (!bannerFromProfile(profileObj)) return true;
  const linksWithoutUserData = buildProfileLinks(profileObj, verifiedAccounts, undefined);
  if (linksWithoutUserData.length > 0) return false;
  const profile = profileObj;
  if (
    profile &&
    (profile.url || profile.twitter || profile.x || profile.github)
  ) {
    return false;
  }
  return true;
}

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
  if (profileNeedsUserData(row, profileObj, verifiedAccounts)) {
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
    bio: bio ?? base.bio,
    ...(bannerUrl ? { bannerUrl } : {}),
    profileLinks,
  };
}

export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const fidParam = searchParams.get("fid");
  const usernameParam = searchParams.get("username")?.replace(/^@/, "").trim();

  if (!fidParam && !usernameParam) {
    return NextResponse.json({ error: "fid or username required" }, { status: 400 });
  }

  try {
    if (fidParam) {
      const fid = parseInt(fidParam, 10);
      if (Number.isNaN(fid)) {
        return NextResponse.json({ error: "invalid fid" }, { status: 400 });
      }
      const user = await withCache(`user:profile:v4:${fid}`, TTL, async () => {
        const data = await hsnap<{ user: unknown }>("/v2/farcaster/user", { fid });
        return enrichProfile(data.user, fid);
      });
      if (!user) {
        return NextResponse.json({ error: "User not found" }, { status: 404 });
      }
      return NextResponse.json({ user });
    }

    const cacheKey = `user:profile:v4:username:${usernameParam!.toLowerCase()}`;
    const user = await withCache(cacheKey, TTL, async () => {
      const found = await lookupUserByUsername(usernameParam!);
      if (!found?.fid) return null;
      const data = await hsnap<{ user: unknown }>("/v2/farcaster/user", { fid: found.fid });
      if (!data.user) return null;
      return enrichProfile(data.user, found.fid);
    });

    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }
    return NextResponse.json({ user });
  } catch (err: unknown) {
    return apiErrorFromHypersnap(err, "[/api/user/profile]");
  }
}
