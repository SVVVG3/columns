import { hsnap, isHypersnapError } from "@/lib/hypersnap";

interface UserDataMessage {
  data?: {
    timestamp?: number;
    userDataBody?: { type?: string; value?: string };
  };
}

interface UserDataByFidResponse {
  messages?: UserDataMessage[];
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
    let best: { value: string; ts: number } | null = null;

    for (const msg of data.messages ?? []) {
      const body = msg.data?.userDataBody;
      if (body?.type !== userDataType) continue;
      const value = body.value?.trim();
      if (!value) continue;
      const ts = msg.data?.timestamp ?? 0;
      if (!best || ts >= best.ts) best = { value, ts };
    }

    return best?.value;
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

/** Fetch social profile fields stored as Farcaster user data (not always on v2 user). */
export async function fetchProfileUserDataFields(
  fid: number
): Promise<ProfileUserDataFields> {
  const [twitter, github, url] = await Promise.all([
    fetchUserDataValue(fid, "USER_DATA_TYPE_TWITTER"),
    fetchUserDataValue(fid, "USER_DATA_TYPE_GITHUB"),
    fetchUserDataValue(fid, "USER_DATA_TYPE_URL"),
  ]);
  return { twitter, github, url };
}
