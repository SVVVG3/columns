import { isFidAllowed } from "@/lib/betaGate";
import type { SessionUser } from "@/types";

/** Full Columns app (columns board, casts, etc.) — allowlisted + managed signer. */
export function canUseFullColumnsApp(user?: SessionUser | null): boolean {
  if (!user?.signerUuid || user.profileOnly) return false;
  return isFidAllowed(user.fid);
}

/** Profile mini app: view any profile; edit own Top 8 when signed in. */
export function canUseProfileMiniApp(_user?: SessionUser | null): boolean {
  return true;
}
