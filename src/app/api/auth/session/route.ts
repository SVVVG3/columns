import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { verifyCsrf } from "@/lib/csrf";
import {
  isAllowlistEnforced,
  isBetaGateEnabled,
  isFidAllowed,
} from "@/lib/betaGate";

/** GET /api/auth/session — return current session user (or null) */
export async function GET() {
  const session = await getSession();
  return NextResponse.json({ user: session.user ?? null });
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

  session.user = { fid: fidNum, signerUuid, username, displayName, pfpUrl };
  await session.save();

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
