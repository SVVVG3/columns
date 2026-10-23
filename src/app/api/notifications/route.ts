import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { deleteCached, withCache } from "@/lib/feedCache";
import { fetchNotificationsPage, type HypersnapNotification } from "@/lib/notifications";
import { apiErrorFromHypersnap } from "@/lib/hypersnap";
import { annotateViewerContext, getFeedViewerContext, normalizeCastHash } from "@/lib/viewerContext";

export const dynamic = "force-dynamic";

const TTL = 30_000;
const NO_STORE = { "Cache-Control": "no-store" };

export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const cursor = searchParams.get("cursor") ?? undefined;
  const limit = Math.min(50, Math.max(1, Number(searchParams.get("limit")) || 20));
  const fid = session.user.fid;
  const fresh = searchParams.get("fresh") === "1";
  const cacheKey = `${fid}:notifications:${cursor ?? ""}:${limit}`;

  try {
    if (fresh && !cursor) {
      deleteCached(cacheKey);
    }
    const data =
      fresh && !cursor
        ? await fetchNotificationsPage(fid, { cursor, limit })
        : await withCache(cacheKey, TTL, () =>
            fetchNotificationsPage(fid, { cursor, limit })
          );
    const withReactions = await attachNotificationViewerContext(fid, data.notifications);
    return NextResponse.json({ ...data, notifications: withReactions }, { headers: NO_STORE });
  } catch (err: unknown) {
    return apiErrorFromHypersnap(err, "[/api/notifications]");
  }
}

/** Stamp liked/recasted onto each notification cast so the row actions start correct. */
async function attachNotificationViewerContext(
  fid: number,
  notifications: HypersnapNotification[]
): Promise<HypersnapNotification[]> {
  const casts = notifications
    .map((n) => n.cast)
    .filter((cast): cast is Record<string, unknown> => !!cast && typeof cast.hash === "string");
  if (casts.length === 0) return notifications;

  try {
    const viewer = await getFeedViewerContext(fid);
    const annotated = annotateViewerContext(casts, viewer);
    const byHash = new Map(
      annotated.map((cast) => [normalizeCastHash(String(cast.hash)), cast])
    );
    return notifications.map((n) => {
      const hash = n.cast?.hash;
      if (typeof hash !== "string") return n;
      const cast = byHash.get(normalizeCastHash(hash));
      return cast ? { ...n, cast } : n;
    });
  } catch (err) {
    console.warn("[/api/notifications] viewer context failed", err);
    return notifications;
  }
}
