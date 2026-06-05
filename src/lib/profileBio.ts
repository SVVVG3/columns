import { readProfileString } from "@/lib/profileLinks";
import {
  fetchUserDataMessages,
  type UserDataMessage,
} from "@/lib/userProfileData";

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

export function bioFromUserDataMessages(messages: UserDataMessage[]): string | undefined {
  let best: { value: string; ts: number } | null = null;
  for (const msg of messages) {
    const body = msg.data?.userDataBody;
    if (body?.type !== "USER_DATA_TYPE_BIO") continue;
    const value = body.value?.trim();
    if (!value) continue;
    const ts = msg.data?.timestamp ?? 0;
    if (!best || ts >= best.ts) best = { value, ts };
  }
  return best?.value;
}

/** Bio from v2 user profile, with optional pre-fetched v1 user-data messages. */
export async function resolveProfileBio(
  raw: unknown,
  fid: number,
  userDataMessages?: UserDataMessage[]
): Promise<string | undefined> {
  const fromUser = extractProfileBio(raw);
  if (fromUser) return fromUser;

  const messages = userDataMessages ?? (await fetchUserDataMessages(fid));
  return bioFromUserDataMessages(messages);
}
