import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { withCache } from "@/lib/feedCache";
import { hsnap, apiErrorFromHypersnap } from "@/lib/hypersnap";
import { normalizeProfileDetails, type ProfileDetails } from "@/lib/profilePreview";
import { buildProfileLinks, readProfileString } from "@/lib/profileLinks";
import { resolveUserBannerUrl } from "@/lib/userBanner";
import { fetchProfileUserDataFields } from "@/lib/userProfileData";
import { lookupUserByUsername } from "@/lib/userSearch";

const TTL = 60_000;

async function enrichProfile(
  raw: unknown,
  fid: number
): Promise<ProfileDetails | null> {
  const base = normalizeProfileDetails(raw);
  if (!base) return null;
  const profile = (raw as Record<string, unknown>).profile as
    | Record<string, unknown>
    | undefined;
  const profileObj = profile;
  const [bannerUrl, userData] = await Promise.all([
    resolveUserBannerUrl(fid, profileObj),
    fetchProfileUserDataFields(fid),
  ]);
  const profileLinks = buildProfileLinks(
    profileObj,
    (raw as Record<string, unknown>).verified_accounts as unknown[] | undefined,
    userData
  );

  const bio =
    base.bio ||
    readProfileString(profileObj?.bio) ||
    readProfileString((raw as Record<string, unknown>).bio);

  return {
    ...base,
    ...(bio ? { bio } : {}),
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
      const user = await withCache(`user:profile:${fid}`, TTL, async () => {
        const data = await hsnap<{ user: unknown }>("/v2/farcaster/user", { fid });
        return enrichProfile(data.user, fid);
      });
      if (!user) {
        return NextResponse.json({ error: "User not found" }, { status: 404 });
      }
      return NextResponse.json({ user });
    }

    const cacheKey = `user:profile:username:${usernameParam!.toLowerCase()}`;
    const user = await withCache(cacheKey, TTL, async () => {
      const found = await lookupUserByUsername(usernameParam!);
      if (!found?.fid) return null;
      const data = await hsnap<{ user: unknown }>("/v2/farcaster/user", { fid: found.fid });
      return (
        (await enrichProfile(data.user, found.fid)) ??
        (await enrichProfile({ ...found, fid: found.fid }, found.fid))
      );
    });

    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }
    return NextResponse.json({ user });
  } catch (err: unknown) {
    return apiErrorFromHypersnap(err, "[/api/user/profile]");
  }
}
