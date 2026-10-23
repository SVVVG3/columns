import { isAllowlistEnforced, isBetaGateEnabled, isFidAllowed } from "@/lib/betaGate";
import { upsertColumnsUser } from "@/lib/columnsRegistry";
import { getSession } from "@/lib/session";
import { upsertUserSigner } from "@/lib/signerRegistry";

export async function saveDesktopUserSession(input: {
  fid: number;
  signerUuid: string;
  username: string;
  displayName: string;
  pfpUrl: string;
}): Promise<
  | { ok: true }
  | { ok: false; status: number; body: Record<string, unknown> }
> {
  const session = await getSession();

  if (isBetaGateEnabled() && !session.betaUnlocked) {
    return { ok: false, status: 403, body: { error: "beta_required" } };
  }

  if (isAllowlistEnforced() && !isFidAllowed(input.fid)) {
    return {
      ok: false,
      status: 403,
      body: {
        error: "not_allowed",
        fid: input.fid,
        username: input.username,
      },
    };
  }

  session.user = {
    fid: input.fid,
    signerUuid: input.signerUuid,
    username: input.username,
    displayName: input.displayName,
    pfpUrl: input.pfpUrl,
    profileOnly: false,
  };
  session.refreshedAt = Date.now();
  delete session.siwf;
  delete session.siwfClaimed;
  delete session.approval;
  await session.save();

  await upsertColumnsUser({
    fid: input.fid,
    username: input.username || undefined,
    displayName: input.displayName || undefined,
    grantBadge: true,
  });

  await upsertUserSigner({
    fid: input.fid,
    signerUuid: input.signerUuid,
    status: "approved",
  });

  return { ok: true };
}
