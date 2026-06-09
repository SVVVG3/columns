import {
  getApprovedSignerForFid,
  upsertUserSigner,
} from "@/lib/signerRegistry";

/**
 * Resolve a signer UUID for session hydration.
 * Order: Supabase (approved) → legacy iron-session value (backfill to Supabase).
 */
export async function resolveSignerUuidForFid(
  fid: number,
  existingSessionSignerUuid?: string
): Promise<string> {
  const stored = await getApprovedSignerForFid(fid);
  if (stored?.signerUuid) return stored.signerUuid;

  const fromSession = existingSessionSignerUuid?.trim() ?? "";
  if (fromSession) {
    await upsertUserSigner({
      fid,
      signerUuid: fromSession,
      status: "approved",
    });
    return fromSession;
  }

  return "";
}
