import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { verifyCsrf } from "@/lib/csrf";
import { upsertColumnsUser } from "@/lib/columnsRegistry";
import { neynar } from "@/lib/neynar";
import { upsertUserSigner } from "@/lib/signerRegistry";
import {
  isAllowlistEnforced,
  isBetaGateEnabled,
  isFidAllowed,
} from "@/lib/betaGate";

/** GET /api/auth/session — return current session user (or null) */
export async function GET() {
  const session = await getSession();
  const user = session.user ?? null;

  if (user && !user.profileOnly) {
    void upsertColumnsUser({
      fid: user.fid,
      username: user.username,
      displayName: user.displayName,
      grantBadge: true,
    });
  }

  // Backfill signer UUID for users who approved before Supabase persistence existed.
  if (user?.signerUuid?.trim() && !user.profileOnly) {
    void upsertUserSigner({
      fid: user.fid,
      signerUuid: user.signerUuid.trim(),
      status: "approved",
    });
  }

  return NextResponse.json({ user });
}

/** POST /api/auth/session — set session after managed signer approval */
export async function POST(req: NextRequest) {
  if (!verifyCsrf(req)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await req.json();
  const { fid, signerUuid, username, displayName, pfpUrl } = body;

  if (!fid || !signerUuid) {
    return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
  }

  const session = await getSession();

  if (isBetaGateEnabled() && !session.betaUnlocked) {
    return NextResponse.json({ error: "beta_required" }, { status: 403 });
  }

  const fidNum = Number(fid);
  if (isAllowlistEnforced() && !isFidAllowed(fidNum)) {
    return NextResponse.json(
      {
        error: "not_allowed",
        fid: fidNum,
        username: username ?? "",
      },
      { status: 403 }
    );
  }

  let signerStatus = "approved";
  let publicKey: string | null = null;
  try {
    const signer = await neynar.lookupSigner({ signerUuid: String(signerUuid) });
    if (signer.status !== "approved" || signer.fid !== fidNum) {
      return NextResponse.json(
        { error: "signer_not_approved" },
        { status: 400 }
      );
    }
    signerStatus = signer.status;
    publicKey = signer.public_key ?? null;
  } catch (err) {
    console.error("[auth/session] signer lookup failed:", err);
    return NextResponse.json({ error: "signer_lookup_failed" }, { status: 502 });
  }

  session.user = {
    fid: fidNum,
    signerUuid,
    username,
    displayName,
    pfpUrl,
    profileOnly: false,
  };
  await session.save();

  await upsertColumnsUser({
    fid: fidNum,
    username: username ?? undefined,
    displayName: displayName ?? undefined,
    grantBadge: true,
  });

  await upsertUserSigner({
    fid: fidNum,
    signerUuid: String(signerUuid),
    status: signerStatus as "approved",
    publicKey,
  });

  return NextResponse.json({ ok: true });
}

/** DELETE /api/auth/session — logout */
export async function DELETE(req: NextRequest) {
  if (!verifyCsrf(req)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const session = await getSession();
  delete session.user;
  await session.save();

  return NextResponse.json({ ok: true });
}
