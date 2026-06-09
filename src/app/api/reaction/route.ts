import { NextRequest, NextResponse } from "next/server";
import { neynar } from "@/lib/neynar";
import { getSession } from "@/lib/session";
import { verifyCsrf } from "@/lib/csrf";
import { canPublishFarcasterWrites } from "@/lib/profileAccess";
import { handleRevokedSignerOnError } from "@/lib/signerWrites";
import { ReactionType } from "@neynar/nodejs-sdk/build/api";
import { deleteCached, invalidateFeedCaches } from "@/lib/feedCache";
import { normalizeCastHash } from "@/lib/viewerContext";

function bustReactionViewerCaches(viewerFid: number, castHash: string) {
  const bare = normalizeCastHash(castHash);
  deleteCached(`viewer:${viewerFid}:likes`);
  deleteCached(`viewer:${viewerFid}:recasts`);
  deleteCached(`batch-interactions:${viewerFid}`);
  deleteCached(`cast:likes:${bare}`);
  deleteCached(`cast:recasts:${bare}`);
  invalidateFeedCaches(viewerFid);
}

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
  if (!canPublishFarcasterWrites(session.user)) {
    return NextResponse.json({ error: "Write access required" }, { status: 403 });
  }

  const { type, castHash, castAuthorFid } = await req.json();

  if (!type || !castHash || !castAuthorFid) {
    return NextResponse.json({ error: "type, castHash, castAuthorFid required" }, { status: 400 });
  }

  try {
    await neynar.publishReaction({
      signerUuid: session.user.signerUuid,
      reactionType: type as ReactionType,
      target: withHexPrefix(castHash),
      targetAuthorFid: castAuthorFid,
    });
  } catch (err) {
    if (await handleRevokedSignerOnError(session.user.fid, err)) {
      return NextResponse.json(
        { error: "signer_revoked", message: "Farcaster permissions were revoked. Sign in on desktop to re-authorize." },
        { status: 403 }
      );
    }
    throw err;
  }

  bustReactionViewerCaches(session.user.fid, castHash);

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
  if (!canPublishFarcasterWrites(session.user)) {
    return NextResponse.json({ error: "Write access required" }, { status: 403 });
  }

  const { type, castHash, castAuthorFid } = await req.json();

  if (!type || !castHash || !castAuthorFid) {
    return NextResponse.json({ error: "type, castHash, castAuthorFid required" }, { status: 400 });
  }

  try {
    await neynar.deleteReaction({
      signerUuid: session.user.signerUuid,
      reactionType: type as ReactionType,
      target: withHexPrefix(castHash),
      targetAuthorFid: castAuthorFid,
    });
  } catch (err) {
    if (await handleRevokedSignerOnError(session.user.fid, err)) {
      return NextResponse.json(
        { error: "signer_revoked", message: "Farcaster permissions were revoked. Sign in on desktop to re-authorize." },
        { status: 403 }
      );
    }
    throw err;
  }

  bustReactionViewerCaches(session.user.fid, castHash);

  return NextResponse.json({ ok: true });
}
