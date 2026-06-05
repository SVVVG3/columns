import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { deleteCached, withCache } from "@/lib/feedCache";
import { fetchNotificationsPage } from "@/lib/notifications";
import { apiErrorFromHypersnap } from "@/lib/hypersnap";

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
    return NextResponse.json(data, { headers: NO_STORE });
  } catch (err: unknown) {
    return apiErrorFromHypersnap(err, "[/api/notifications]");
  }
}
