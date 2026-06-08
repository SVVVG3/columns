import { NextRequest, NextResponse } from "next/server";
import { verifyCsrf } from "@/lib/csrf";
import { upsertColumnsUser } from "@/lib/columnsRegistry";
import {
  hydrateTop8Slots,
  loadTop8StoredSlots,
  saveTop8Slots,
} from "@/lib/profileTop8";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import { getSession } from "@/lib/session";

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

  try {
    const rows = await loadTop8StoredSlots(ownerFid);
    const slots = await hydrateTop8Slots(rows);
    return NextResponse.json({ slots, configured: true });
  } catch (err) {
    console.error("[/api/profile/top8 GET]", err);
    return NextResponse.json({ error: "Failed to load Top 8" }, { status: 500 });
  }
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

  try {
    const stored = await saveTop8Slots(ownerFid, slots);
    const hydrated = await hydrateTop8Slots(stored);
    return NextResponse.json({ ok: true, slots: hydrated });
  } catch (err) {
    console.error("[/api/profile/top8 PUT]", err);
    return NextResponse.json({ error: "Failed to update Top 8" }, { status: 500 });
  }
}
