import { NextRequest, NextResponse } from "next/server";
import { hsnap } from "@/lib/hypersnap";
import { getSession } from "@/lib/session";
import { withCache } from "@/lib/feedCache";
import { normalizeCastTree } from "@/lib/normalizeCast";
import { getConversationViewerContext, annotateConversationTree } from "@/lib/viewerContext";

const TTL = 60_000;

interface HsnapConversationResponse {
  conversation: {
    // cast includes nested direct_replies[], mirroring the Neynar conversation shape
    cast: Record<string, unknown>;
  };
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ hash: string }> }
) {
  const session = await getSession();
  if (!session.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { hash } = await params;
  if (!hash) {
    return NextResponse.json({ error: "hash required" }, { status: 400 });
  }

  const cacheKey = `conversation:${hash}`;

  try {
    const data = await withCache(cacheKey, TTL, async () => {
      // Hypersnap wraps: { conversation: { cast: { ...castData, direct_replies: [...] } } }
      const res = await hsnap<HsnapConversationResponse>(
        "/v2/farcaster/cast/conversation",
        { identifier: hash, type: "hash", reply_depth: 3 }
      );
      return res.conversation;
    });

    const normalizedCast = normalizeCastTree(data.cast);

    // Use per-cast reaction/cast lookups so liked state is accurate for ALL
    // historical likes (not capped at the 100 most recent from reaction/user).
    const vc = await getConversationViewerContext(
      normalizedCast as Record<string, unknown>,
      session.user.fid
    );

    const annotatedCast = annotateConversationTree(
      normalizedCast as Record<string, unknown>,
      vc
    );

    return NextResponse.json({ cast: annotatedCast });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 502 });
  }
}
