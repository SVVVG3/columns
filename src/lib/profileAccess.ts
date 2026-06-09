import { isFidAllowed } from "@/lib/betaGate";
import type { SessionUser } from "@/types";

function hasSignerUuid(user?: SessionUser | null): boolean {
  return !!user?.signerUuid?.trim();
}

/** Full Columns desktop app — allowlisted + managed signer via desktop sign-in. */
export function canUseFullColumnsApp(user?: SessionUser | null): boolean {
  if (!user || !hasSignerUuid(user) || user.profileOnly) return false;
  return isFidAllowed(user.fid);
}

/**
 * Farcaster write access (like, recast, cast) — allowlisted + stored signer.
 * Works for mini app Quick Auth sessions when signerUuid is present.
 */
export function canPublishFarcasterWrites(user?: SessionUser | null): boolean {
  if (!user || !hasSignerUuid(user)) return false;
  return isFidAllowed(user.fid);
}

/** Profile mini app: view any profile; edit own Top 8 when signed in. */
export function canUseProfileMiniApp(_user?: SessionUser | null): boolean {
  return true;
}
