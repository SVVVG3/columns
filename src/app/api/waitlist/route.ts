import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import { checkUserFollows } from "@/lib/followCheck";

/** FID of the @columns Farcaster profile (FARCASTER_DEVELOPER_FID). */
function getColumnsFid(): number {
  const raw = process.env.FARCASTER_DEVELOPER_FID?.trim();
  const fid = raw ? Number(raw) : NaN;
  return Number.isFinite(fid) && fid > 0 ? fid : 0;
}

/**
 * True if `fid` is a member/follower of the /columns Farcaster channel.
 * Uses the Neynar REST API since Hypersnap does not expose channel-follow checks.
 */
async function checkChannelFollow(fid: number): Promise<boolean> {
  const apiKey = process.env.NEYNAR_API_KEY?.trim();
  if (!apiKey) return false;

  try {
    // Paginate up to 3 pages (300 channels) looking for "columns"
    let cursor: string | undefined;
    for (let page = 0; page < 3; page++) {
      const url = new URL("https://api.neynar.com/v2/farcaster/user/channels");
      url.searchParams.set("fid", String(fid));
      url.searchParams.set("type", "following");
      url.searchParams.set("limit", "100");
      if (cursor) url.searchParams.set("cursor", cursor);

      const res = await fetch(url.toString(), {
        headers: { "x-api-key": apiKey },
        next: { revalidate: 0 },
      });
      if (!res.ok) break;

      const data = (await res.json()) as {
        channels?: Array<{ id?: string }>;
        next?: { cursor?: string };
      };

      if ((data.channels ?? []).some((ch) => ch.id === "columns")) return true;
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
