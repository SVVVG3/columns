import { NextRequest, NextResponse } from "next/server";
import type { PostCastReqBodyEmbeds } from "@neynar/nodejs-sdk/build/api";
import { neynar } from "@/lib/neynar";
import { getSession } from "@/lib/session";
import { verifyCsrf } from "@/lib/csrf";
import { deleteCached, invalidateFeedCaches } from "@/lib/feedCache";

/** Hypersnap omits the 0x prefix; Neynar requires it. */
function withHexPrefix(hash: string): string {
  return hash.startsWith("0x") ? hash : `0x${hash}`;
}

function parsePublishEmbeds(embeds: unknown): PostCastReqBodyEmbeds[] {
  if (!Array.isArray(embeds)) return [];
  const out: PostCastReqBodyEmbeds[] = [];
  for (const e of embeds) {
    if (!e || typeof e !== "object") continue;
    const row = e as Record<string, unknown>;
    if (typeof row.url === "string" && row.url.startsWith("http")) {
      out.push({ url: row.url } as PostCastReqBodyEmbeds);
      continue;
    }
    const raw = (row.cast_id ?? row.castId) as Record<string, unknown> | undefined;
    const fid = raw?.fid != null ? Number(raw.fid) : NaN;
    const hash = typeof raw?.hash === "string" ? raw.hash : "";
    if (Number.isFinite(fid) && fid > 0 && hash) {
      const castId = { fid, hash: withHexPrefix(hash) };
      // Neynar rejects embeds that include both castId and url (even url: "").
      out.push({ cast_id: castId, castId } as PostCastReqBodyEmbeds);
    }
  }
  return out;
}

/** POST /api/cast — publish a new cast or reply */
export async function POST(req: NextRequest) {
  if (!verifyCsrf(req)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const session = await getSession();
  if (!session.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { text, parentHash, channelId, embeds, threadRootHash } = await req.json();

  const trimmedText = typeof text === "string" ? text.trim() : "";
  const embedList = parsePublishEmbeds(embeds);

  if (!trimmedText && embedList.length === 0) {
    return NextResponse.json({ error: "Text, image, or quoted cast is required" }, { status: 400 });
  }

  try {
    const cast = await neynar.publishCast({
      signerUuid: session.user.signerUuid,
      text: trimmedText || undefined,
      parent: parentHash ? withHexPrefix(parentHash) : undefined,
      channelId: channelId ?? undefined,
      embeds: embedList.length > 0 ? embedList : undefined,
    });

    invalidateFeedCaches(session.user.fid);

    // Bust the server-side conversation cache so the new reply is visible
    // immediately when the panel refetches. threadRootHash targets the root
    // of the thread; parentHash is a fallback for direct root replies.
    if (threadRootHash) {
      deleteCached(`conversation:${threadRootHash}`);
    } else if (parentHash) {
      deleteCached(`conversation:${parentHash}`);
    }

    return NextResponse.json(cast);
  } catch (err: unknown) {
    const axiosData =
      err && typeof err === "object" && "response" in err
        ? (err as { response?: { data?: { message?: string } } }).response?.data
        : undefined;
    const message =
      axiosData?.message ??
      (err instanceof Error ? err.message : "Failed to publish cast");
    console.error("[/api/cast]", message, err);
    return NextResponse.json({ error: message }, { status: 502 });
  }
}

/** DELETE /api/cast — delete a cast */
export async function DELETE(req: NextRequest) {
  if (!verifyCsrf(req)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const session = await getSession();
  if (!session.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { hash } = await req.json();

  if (!hash) {
    return NextResponse.json({ error: "Cast hash is required" }, { status: 400 });
  }

  await neynar.deleteCast({
    signerUuid: session.user.signerUuid,
    targetHash: withHexPrefix(hash),
  });

  return NextResponse.json({ ok: true });
}
