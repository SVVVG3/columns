import { NextRequest, NextResponse } from "next/server";
import { saveDesktopUserSession } from "@/lib/desktopSession";
import { verifyCsrf } from "@/lib/csrf";
import { createAndRegisterAppSigner } from "@/lib/appSigner";
import { lookupUserByFid } from "@/lib/userSearch";
import { getSession } from "@/lib/session";
import { createSiwfChannel, readSiwfStatus, verifySiwfMessage } from "@/lib/siwf";
import { getApprovedSignerForFid, markUserSignerRevoked } from "@/lib/signerRegistry";
import { neynar } from "@/lib/neynar";
import { isBetaGateEnabled } from "@/lib/betaGate";

/** POST /api/auth/siwf — start a Sign in with Farcaster QR. */
export async function POST(req: NextRequest) {
  if (!verifyCsrf(req)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const session = await getSession();
  if (isBetaGateEnabled() && !session.betaUnlocked) {
    return NextResponse.json({ error: "beta_required" }, { status: 403 });
  }

  try {
    const channel = await createSiwfChannel();
    session.siwf = {
      channelToken: channel.channelToken,
      nonce: channel.nonce,
      domain: channel.domain,
    };
    delete session.siwfClaimed;
    delete session.approval;
    await session.save();
    return NextResponse.json({ url: channel.url });
  } catch (err) {
    console.error("[auth/siwf] create failed:", err);
    return NextResponse.json({ error: "siwf_start_failed" }, { status: 502 });
  }
}

/** GET /api/auth/siwf — poll the QR. Reuses the stored signer when one exists. */
export async function GET() {
  const session = await getSession();

  if (session.user && !session.user.profileOnly && session.user.signerUuid) {
    return NextResponse.json({ status: "signed_in" });
  }

  if (session.approval?.signerUuid) {
    return NextResponse.json({
      status: "needs_approval",
      signer_uuid: session.approval.signerUuid,
      signer_approval_url: session.approval.signerApprovalUrl,
    });
  }

  const challenge = session.siwf;
  if (!challenge || session.siwfClaimed) {
    return NextResponse.json({ status: "pending" });
  }

  let state;
  try {
    state = await readSiwfStatus(challenge.channelToken);
  } catch (err) {
    console.error("[auth/siwf] status failed:", err);
    return NextResponse.json({ error: "siwf_status_failed" }, { status: 502 });
  }

  if (state.state !== "completed" || !state.message || !state.signature || !state.fid) {
    return NextResponse.json({ status: "pending" });
  }

  session.siwfClaimed = true;
  delete session.siwf;
  await session.save();

  const verified = await verifySiwfMessage({
    nonce: challenge.nonce,
    domain: challenge.domain,
    message: state.message,
    signature: state.signature,
    fid: state.fid,
  });
  if (!verified) {
    delete session.siwfClaimed;
    await session.save();
    return NextResponse.json({ error: "siwf_invalid" }, { status: 401 });
  }

  const profile = await lookupUserByFid(state.fid);
  const username = profile?.username ?? state.username ?? "";
  const displayName = profile?.display_name ?? state.displayName ?? username;
  const pfpUrl = profile?.pfp_url ?? state.pfpUrl ?? "";

  const stored = await getApprovedSignerForFid(state.fid);
  if (stored?.signerUuid) {
    try {
      const signer = await neynar.lookupSigner({ signerUuid: stored.signerUuid });
      if (signer.status === "approved" && signer.fid === state.fid) {
        const saved = await saveDesktopUserSession({
          fid: state.fid,
          signerUuid: stored.signerUuid,
          username,
          displayName,
          pfpUrl,
        });
        if (!saved.ok) {
          delete session.siwfClaimed;
          await session.save();
          return NextResponse.json(saved.body, { status: saved.status });
        }
        return NextResponse.json({ status: "signed_in" });
      }
      await markUserSignerRevoked(state.fid);
    } catch (err) {
      console.error("[auth/siwf] stored signer lookup failed:", err);
      delete session.siwfClaimed;
      await session.save();
      return NextResponse.json({ error: "signer_lookup_failed" }, { status: 502 });
    }
  }

  try {
    const created = await createAndRegisterAppSigner();
    session.approval = {
      signerUuid: created.signer_uuid,
      signerApprovalUrl: created.signer_approval_url ?? null,
    };
    await session.save();
    return NextResponse.json({
      status: "needs_approval",
      signer_uuid: created.signer_uuid,
      signer_approval_url: created.signer_approval_url ?? null,
    });
  } catch (err) {
    console.error("[auth/siwf] signer create failed:", err);
    delete session.siwfClaimed;
    await session.save();
    return NextResponse.json({ error: "signer_create_failed" }, { status: 502 });
  }
}
