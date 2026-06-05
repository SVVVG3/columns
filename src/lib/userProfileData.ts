import { hsnap, isHypersnapError } from "@/lib/hypersnap";

export interface UserDataMessage {
  data?: {
    timestamp?: number;
    userDataBody?: { type?: string; value?: string };
  };
}

interface UserDataByFidResponse {
  messages?: UserDataMessage[];
}

function latestUserDataValue(
  messages: UserDataMessage[],
  userDataType: string
): string | undefined {
  let best: { value: string; ts: number } | null = null;
  for (const msg of messages) {
    const body = msg.data?.userDataBody;
    if (body?.type !== userDataType) continue;
    const value = body.value?.trim();
    if (!value) continue;
    const ts = msg.data?.timestamp ?? 0;
    if (!best || ts >= best.ts) best = { value, ts };
  }
  return best?.value;
}

/** One Hypersnap round-trip for all user-data messages (banner, bio, social links). */
export async function fetchUserDataMessages(fid: number): Promise<UserDataMessage[]> {
  try {
    const data = await hsnap<UserDataByFidResponse>("/v1/userDataByFid", { fid });
    return data.messages ?? [];
  } catch (err: unknown) {
    if (isHypersnapError(err) && (err.status === 404 || err.status === 400)) {
      return [];
    }
    throw err;
  }
}

/** Latest value for a given user data type from v1 userDataByFid. */
export async function fetchUserDataValue(
  fid: number,
  userDataType: string
): Promise<string | undefined> {
  try {
    const data = await hsnap<UserDataByFidResponse>("/v1/userDataByFid", {
      fid,
      user_data_type: userDataType,
    });
    return latestUserDataValue(data.messages ?? [], userDataType);
  } catch (err: unknown) {
    if (isHypersnapError(err) && (err.status === 404 || err.status === 400)) {
      return undefined;
    }
    throw err;
  }
}

export type ProfileUserDataFields = {
  twitter?: string;
  github?: string;
  url?: string;
};

export function profileUserDataFieldsFromMessages(
  messages: UserDataMessage[]
): ProfileUserDataFields {
  return {
    twitter: latestUserDataValue(messages, "USER_DATA_TYPE_TWITTER"),
    github: latestUserDataValue(messages, "USER_DATA_TYPE_GITHUB"),
    url: latestUserDataValue(messages, "USER_DATA_TYPE_URL"),
  };
}

/** Fetch social profile fields stored as Farcaster user data (not always on v2 user). */
export async function fetchProfileUserDataFields(
  fid: number
): Promise<ProfileUserDataFields> {
  const messages = await fetchUserDataMessages(fid);
  return profileUserDataFieldsFromMessages(messages);
}
