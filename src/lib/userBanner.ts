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

function bannerFromProfile(profile: Record<string, unknown> | undefined): string | undefined {
  if (!profile) return undefined;
  for (const key of ["banner", "banner_url", "bannerUrl"]) {
    const v = profile[key];
    if (typeof v === "string" && v.trim().startsWith("http")) return v.trim();
    if (v && typeof v === "object") {
      const text = (v as { text?: unknown; url?: unknown }).text ?? (v as { url?: unknown }).url;
      if (typeof text === "string" && text.trim().startsWith("http")) return text.trim();
    }
  }
  return undefined;
}

function bannerFromUserDataMessages(messages: UserDataMessage[]): string | undefined {
  let best: { url: string; ts: number } | null = null;

  for (const msg of messages) {
    const body = msg.data?.userDataBody;
    if (body?.type !== "USER_DATA_TYPE_BANNER") continue;
    const value = body.value?.trim();
    if (!value?.startsWith("http")) continue;
    const ts = msg.data?.timestamp ?? 0;
    if (!best || ts >= best.ts) best = { url: value, ts };
  }

  return best?.url;
}

/** Resolve profile banner URL from v2 profile object or v1 user data. */
export async function resolveUserBannerUrl(
  fid: number,
  profile?: Record<string, unknown>
): Promise<string | undefined> {
  const fromProfile = bannerFromProfile(profile);
  if (fromProfile) return fromProfile;

  try {
    const data = await hsnap<UserDataByFidResponse>("/v1/userDataByFid", {
      fid,
      user_data_type: "USER_DATA_TYPE_BANNER",
    });
    return bannerFromUserDataMessages(data.messages ?? []);
  } catch (err: unknown) {
    if (isHypersnapError(err) && (err.status === 404 || err.status === 400)) {
      return undefined;
    }
    throw err;
  }
}
