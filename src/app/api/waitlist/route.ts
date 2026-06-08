import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import { checkUserFollows } from "@/lib/followCheck";
import { hsnap } from "@/lib/hypersnap";

/** FID of the @columns Farcaster profile (FARCASTER_DEVELOPER_FID). */
function getColumnsFid(): number {
  const raw = process.env.FARCASTER_DEVELOPER_FID?.trim();
  const fid = raw ? Number(raw) : NaN;
  return Number.isFinite(fid) && fid > 0 ? fid : 0;
}

/**
 * True if `fid` is a follower/member of the /columns Farcaster channel.
 * Uses Hypersnap's channel/members endpoint (same data source as the social graph).
 * Paginates up to 10 pages (1 000 members) before giving up.
 */
async function checkChannelFollow(fid: number): Promise<boolean> {
  try {
    let cursor: string | undefined;
    for (let page = 0; page < 10; page++) {
      const data = await hsnap<{
        users?: Array<{ fid?: number }>;
        next?: { cursor?: string };
      }>("/v2/farcaster/channel/members", {
        channel_id: "columns",
        limit: 100,
        cursor,
      });

      if ((data.users ?? []).some((u) => u.fid === fid)) return true;
      if (!data.next?.cursor) break;
      cursor = data.next.cursor;
    }
    return false;
  } catch {
    return false;
  }
}

/** GET /api/waitlist?fid=... — check if a FID is already on the waitlist */
export async function GET(req: NextRequest) {
  const fid = Number(req.nextUrl.searchParams.get("fid"));
  if (!Number.isFinite(fid) || fid <= 0) {
    return NextResponse.json({ error: "fid required" }, { status: 400 });
  }

  const sb = getSupabaseAdmin();
  if (!sb) return NextResponse.json({ onWaitlist: false });

  const { data } = await sb
    .from("waitlist_entries")
    .select("fid")
    .eq("fid", fid)
    .maybeSingle();

  return NextResponse.json({ onWaitlist: !!data });
}

/** POST /api/waitlist — verify follows and add to waitlist */
export async function POST() {
  const session = await getSession();
  if (!session.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { fid, username } = session.user;
  const columnsFid = getColumnsFid();

  if (!columnsFid) {
    return NextResponse.json({ error: "Columns FID not configured" }, { status: 503 });
  }

  // Check both follows in parallel
  const [followsProfile, followsChannel] = await Promise.all([
    checkUserFollows(fid, columnsFid),
    checkChannelFollow(fid),
  ]);

  if (!followsProfile || !followsChannel) {
    return NextResponse.json({
      ok: false,
      needsFollow: true,
      followsProfile,
      followsChannel,
    });
  }

  const sb = getSupabaseAdmin();
  if (!sb) return NextResponse.json({ error: "DB unavailable" }, { status: 503 });

  // Ensure the user exists in columns_users (FK requirement)
  await sb.from("columns_users").upsert(
    { fid, username: username ?? null, last_seen_at: new Date().toISOString() },
    { onConflict: "fid", ignoreDuplicates: true }
  );

  const { error } = await sb
    .from("waitlist_entries")
    .upsert({ fid, username: username ?? null }, { onConflict: "fid", ignoreDuplicates: true });

  if (error) {
    console.error("[waitlist] upsert failed:", error.message);
    return NextResponse.json({ error: "Failed to join waitlist" }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
