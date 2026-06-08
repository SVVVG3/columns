import { NextRequest, NextResponse } from "next/server";
import { upsertColumnsUser } from "@/lib/columnsRegistry";
import { canUseMiniAppColumns } from "@/lib/betaGate";
import { verifyQuickAuthToken } from "@/lib/miniappAuth";
import { getSession } from "@/lib/session";
import { lookupUserByFid } from "@/lib/userSearch";

/**
 * POST /api/auth/miniapp — Quick Auth sign-in for profile mini app.
 * No beta password or FID allowlist — any Farcaster user can edit/share Top 8.
 */
export async function POST(req: NextRequest) {
  const fid = await verifyQuickAuthToken(req.headers.get("authorization"));
  if (!fid) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const user = await lookupUserByFid(fid);
  if (!user) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  const session = await getSession();
  session.user = {
    fid: user.fid,
    signerUuid: "",
    username: user.username ?? String(fid),
    displayName: user.display_name ?? user.username ?? String(fid),
    pfpUrl: user.pfp_url ?? "",
    profileOnly: true,
  };
  await session.save();

  void upsertColumnsUser({
    fid: user.fid,
    username: session.user.username,
    displayName: session.user.displayName,
  });

  return NextResponse.json({
    ok: true,
    user: {
      fid: session.user.fid,
      username: session.user.username,
      displayName: session.user.displayName,
      pfpUrl: session.user.pfpUrl,
      profileOnly: true,
      columnsAccess: canUseMiniAppColumns(session.user.fid),
    },
  });
}

/** GET /api/auth/miniapp — current profile mini app session (if any). */
export async function GET() {
  const session = await getSession();
  const user = session.user?.profileOnly ? session.user : null;
  return NextResponse.json({
    user: user
      ? { ...user, columnsAccess: canUseMiniAppColumns(user.fid) }
      : null,
  });
}
