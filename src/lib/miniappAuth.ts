import { createClient } from "@farcaster/quick-auth";
import { getAppHostname } from "@/lib/appUrl";

const quickAuth = createClient();

export async function verifyQuickAuthToken(
  authorizationHeader: string | null
): Promise<number | null> {
  if (!authorizationHeader?.startsWith("Bearer ")) return null;
  const token = authorizationHeader.slice("Bearer ".length).trim();
  if (!token) return null;

  try {
    const payload = await quickAuth.verifyJwt({
      token,
      domain: getAppHostname(),
    });
    const fid = Number(payload.sub);
    return Number.isInteger(fid) && fid > 0 ? fid : null;
  } catch (err) {
    console.error("[miniappAuth] verifyJwt failed:", err);
    return null;
  }
}
