import { neynar } from "@/lib/neynar";
import { markUserSignerRevoked } from "@/lib/signerRegistry";
import { getSession } from "@/lib/session";

function errorMessage(err: unknown): string {
  if (err && typeof err === "object" && "response" in err) {
    const data = (err as { response?: { data?: { message?: string } } }).response
      ?.data;
    if (data?.message) return data.message;
  }
  return err instanceof Error ? err.message : String(err);
}

/** True when Neynar rejects a write because the managed signer is no longer valid. */
export function isSignerRevokedError(err: unknown): boolean {
  const msg = errorMessage(err).toLowerCase();
  return (
    msg.includes("revoked") ||
    msg.includes("not approved") ||
    msg.includes("invalid signer") ||
    msg.includes("signer not found")
  );
}

/**
 * On a revoked-signer write failure: mark signer revoked in Supabase and clear
 * it from the current session so the client stops attempting writes.
 */
export async function handleRevokedSignerOnError(
  fid: number,
  err: unknown
): Promise<boolean> {
  if (!isSignerRevokedError(err)) return false;

  await markUserSignerRevoked(fid);

  try {
    const session = await getSession();
    if (session.user?.fid === fid) {
      session.user.signerUuid = "";
      await session.save();
    }
  } catch (saveErr) {
    console.error("[signerWrites] session clear failed:", saveErr);
  }

  return true;
}

/** Verify signer is still approved with Neynar before trusting a stored UUID. */
export async function verifySignerStillApproved(
  signerUuid: string,
  fid: number
): Promise<boolean> {
  try {
    const signer = await neynar.lookupSigner({ signerUuid });
    return signer.status === "approved" && signer.fid === fid;
  } catch {
    return false;
  }
}
