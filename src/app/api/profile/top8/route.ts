import { NextRequest, NextResponse } from "next/server";
import { verifyCsrf } from "@/lib/csrf";
import { hsnap } from "@/lib/hypersnap";
import { upsertColumnsUser } from "@/lib/columnsRegistry";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import { getSession } from "@/lib/session";
import type { Top8Slot } from "@/types";

interface Top8PutSlot {
  position: number;
  targetFid: number;
}

function parsePutSlots(body: unknown): Top8PutSlot[] | null {
  if (!body || typeof body !== "object") return null;
  const slots = (body as { slots?: unknown }).slots;
  if (!Array.isArray(slots)) return null;

  const parsed: Top8PutSlot[] = [];
  const seenPositions = new Set<number>();
  const seenFids = new Set<number>();

  for (const raw of slots) {
    if (!raw || typeof raw !== "object") return null;
    const position = Number((raw as Top8PutSlot).position);
    const targetFid = Number((raw as Top8PutSlot).targetFid);
    if (
      !Number.isInteger(position) ||
      position < 1 ||
      position > 8 ||
      !Number.isInteger(targetFid) ||
      targetFid <= 0
    ) {
      return null;
    }
    if (seenPositions.has(position) || seenFids.has(targetFid)) return null;
    seenPositions.add(position);
    seenFids.add(targetFid);
    parsed.push({ position, targetFid });
  }

  return parsed;
}

async function hydrateTop8Slots(
  rows: { position: number; target_fid: number }[]
): Promise<Top8Slot[]> {
  if (rows.length === 0) return [];

  const fids = [...new Set(rows.map((r) => r.target_fid))].sort((a, b) => a - b);
  let users: {
    fid?: number;
    username?: string;
    display_name?: string;
    pfp_url?: string;
  }[] = [];

  try {
    const data = await hsnap<{ users: typeof users }>("/v2/farcaster/user/bulk", {
      fids: fids.join(","),
    });
    users = data.users ?? [];
  } catch (err) {
    console.error("[/api/profile/top8] bulk hydrate failed:", err);
  }

  const byFid = new Map(users.map((u) => [u.fid, u]));

  return rows
    .sort((a, b) => a.position - b.position)
    .map((row) => {
      const u = byFid.get(row.target_fid);
      return {
        position: row.position,
        fid: row.target_fid,
        username: u?.username ?? String(row.target_fid),
        displayName: u?.display_name ?? u?.username ?? String(row.target_fid),
        pfpUrl: u?.pfp_url ?? null,
      };
    });
}

/** GET /api/profile/top8?fid= — Top 8 slots for a profile (public read). */
export async function GET(req: NextRequest) {
  const ownerFid = parseInt(req.nextUrl.searchParams.get("fid") ?? "", 10);
  if (Number.isNaN(ownerFid)) {
    return NextResponse.json({ slots: [] });
  }

  const sb = getSupabaseAdmin();
  if (!sb) {
    return NextResponse.json({ slots: [], configured: false });
  }

  const { data, error } = await sb
    .from("profile_top8")
    .select("position, target_fid")
    .eq("owner_fid", ownerFid)
    .order("position", { ascending: true });

  if (error) {
    console.error("[/api/profile/top8 GET]", error.message);
    return NextResponse.json({ error: "Failed to load Top 8" }, { status: 500 });
  }

  const slots = await hydrateTop8Slots(data ?? []);
  return NextResponse.json({ slots, configured: true });
}

/** PUT /api/profile/top8 — replace owner's Top 8 (session auth). */
export async function PUT(req: NextRequest) {
  if (!verifyCsrf(req)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const session = await getSession();
  if (!session.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  // Allowed for profile-only mini app sessions (no allowlist required).

  const sb = getSupabaseAdmin();
  if (!sb) {
    return NextResponse.json({ error: "Supabase not configured" }, { status: 503 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const slots = parsePutSlots(body);
  if (slots === null) {
    return NextResponse.json({ error: "Invalid slots" }, { status: 400 });
  }

  const ownerFid = session.user.fid;
  if (slots.some((s) => s.targetFid === ownerFid)) {
    return NextResponse.json({ error: "Cannot add yourself to Top 8" }, { status: 400 });
  }

  await upsertColumnsUser({
    fid: ownerFid,
    username: session.user.username,
    displayName: session.user.displayName,
  });

  const { error: deleteError } = await sb
    .from("profile_top8")
    .delete()
    .eq("owner_fid", ownerFid);

  if (deleteError) {
    console.error("[/api/profile/top8 PUT delete]", deleteError.message);
    return NextResponse.json({ error: "Failed to update Top 8" }, { status: 500 });
  }

  if (slots.length > 0) {
    const { error: insertError } = await sb.from("profile_top8").insert(
      slots.map((s) => ({
        owner_fid: ownerFid,
        position: s.position,
        target_fid: s.targetFid,
      }))
    );

    if (insertError) {
      console.error("[/api/profile/top8 PUT insert]", insertError.message);
      return NextResponse.json({ error: "Failed to update Top 8" }, { status: 500 });
    }
  }

  const rows = slots.map((s) => ({
    position: s.position,
    target_fid: s.targetFid,
  }));
  const hydrated = await hydrateTop8Slots(rows);
  return NextResponse.json({ ok: true, slots: hydrated });
}
