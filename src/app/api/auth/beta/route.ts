import { NextRequest, NextResponse } from "next/server";
import { verifyCsrf } from "@/lib/csrf";
import { isBetaGateEnabled } from "@/lib/betaGate";
import { verifyBetaPassword } from "@/lib/verifyBetaPassword";
import { getSession } from "@/lib/session";

/** GET — beta gate status for the auth screen. */
export async function GET() {
  const session = await getSession();
  return NextResponse.json({
    enabled: isBetaGateEnabled(),
    unlocked: !!session.betaUnlocked,
  });
}

/** POST — verify shared beta password and unlock SIWN. */
export async function POST(req: NextRequest) {
  if (!verifyCsrf(req)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  if (!isBetaGateEnabled()) {
    return NextResponse.json({ ok: true, unlocked: true });
  }

  const body = (await req.json()) as { password?: string };
  const password = body.password?.trim() ?? "";

  if (!verifyBetaPassword(password)) {
    return NextResponse.json({ error: "invalid_password" }, { status: 401 });
  }

  const session = await getSession();
  session.betaUnlocked = true;
  await session.save();

  return NextResponse.json({ ok: true, unlocked: true });
}
