import { readProfileString } from "@/lib/profileLinks";
import { fetchUserDataValue } from "@/lib/userProfileData";

/** Read bio text from a Hypersnap v2 user object. */
export function extractProfileBio(raw: unknown): string | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const u = raw as Record<string, unknown>;
  const profile = u.profile as Record<string, unknown> | undefined;
  const text =
    readProfileString(profile?.bio) ||
    readProfileString(u.bio) ||
    readProfileString(u.profile_bio);
  return text?.trim() || undefined;
}

/** Bio from v2 user profile, with v1 user-data fallback when profile.bio is absent. */
export async function resolveProfileBio(
  raw: unknown,
  fid: number
): Promise<string | undefined> {
  const fromUser = extractProfileBio(raw);
  if (fromUser) return fromUser;

  const fromUserData = await fetchUserDataValue(fid, "USER_DATA_TYPE_BIO");
  return fromUserData?.trim() || undefined;
}
