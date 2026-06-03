import { NextRequest, NextResponse } from "next/server";
import { neynar } from "@/lib/neynar";
import { getSession } from "@/lib/session";
import { verifyCsrf } from "@/lib/csrf";
import { ReactionType } from "@neynar/nodejs-sdk/build/api";
import { deleteCached } from "@/lib/feedCache";

/** Hypersnap omits the 0x prefix; Neynar requires it. */
function withHexPrefix(hash: string): string {
  return hash.startsWith("0x") ? hash : `0x${hash}`;
}

/** POST /api/reaction — like or recast */
export async function POST(req: NextRequest) {
  if (!verifyCsrf(req)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const session = await getSession();
  if (!session.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { type, castHash, castAuthorFid } = await req.json();

  if (!type || !castHash || !castAuthorFid) {
    return NextResponse.json({ error: "type, castHash, castAuthorFid required" }, { status: 400 });
  }

  await neynar.publishReaction({
    signerUuid: session.user.signerUuid,
    reactionType: type as ReactionType,
    target: withHexPrefix(castHash),
    targetAuthorFid: castAuthorFid,
  });

  // Bust the viewer-context cache so the next feed/conversation load reflects this reaction.
  deleteCached(`viewer:${session.user.fid}:likes`);
  deleteCached(`viewer:${session.user.fid}:recasts`);

  return NextResponse.json({ ok: true });
}

/** DELETE /api/reaction — unlike or unrecast */
export async function DELETE(req: NextRequest) {
  if (!verifyCsrf(req)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const session = await getSession();
  if (!session.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { type, castHash, castAuthorFid } = await req.json();

  if (!type || !castHash || !castAuthorFid) {
    return NextResponse.json({ error: "type, castHash, castAuthorFid required" }, { status: 400 });
  }

  await neynar.deleteReaction({
    signerUuid: session.user.signerUuid,
    reactionType: type as ReactionType,
    target: withHexPrefix(castHash),
    targetAuthorFid: castAuthorFid,
  });

  // Bust the viewer-context cache so the next feed/conversation load reflects this reaction.
  deleteCached(`viewer:${session.user.fid}:likes`);
  deleteCached(`viewer:${session.user.fid}:recasts`);

  return NextResponse.json({ ok: true });
}
