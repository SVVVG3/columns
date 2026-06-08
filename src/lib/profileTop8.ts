import { hsnap } from "@/lib/hypersnap";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import type { Top8Slot } from "@/types";

/** Persisted shape inside profile_top8.slots JSONB. */
export interface Top8StoredSlot {
  position: number;
  target_fid: number;
}

function parseStoredSlots(raw: unknown): Top8StoredSlot[] {
  if (!Array.isArray(raw)) return [];
  const parsed: Top8StoredSlot[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const position = Number((item as Top8StoredSlot).position);
    const target_fid = Number((item as Top8StoredSlot).target_fid);
    if (
      Number.isInteger(position) &&
      position >= 1 &&
      position <= 8 &&
      Number.isInteger(target_fid) &&
      target_fid > 0
    ) {
      parsed.push({ position, target_fid });
    }
  }
  return parsed.sort((a, b) => a.position - b.position);
}

export async function hydrateTop8Slots(rows: Top8StoredSlot[]): Promise<Top8Slot[]> {
  if (rows.length === 0) return [];

  const fids = [...new Set(rows.map((r) => r.target_fid))].sort((a, b) => a - b);
  let users: {
    fid?: number;
    username?: string;
    display_name?: string;
    pfp_url?: string;
  }[] = [];

  try {
    const bulk = await hsnap<{ users: typeof users }>("/v2/farcaster/user/bulk", {
      fids: fids.join(","),
    });
    users = bulk.users ?? [];
  } catch {
    // OG / public views degrade gracefully
  }

  const byFid = new Map(users.map((u) => [u.fid, u]));

  return rows.map((row) => {
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

export async function loadTop8StoredSlots(ownerFid: number): Promise<Top8StoredSlot[]> {
  const sb = getSupabaseAdmin();
  if (!sb) return [];

  const { data, error } = await sb
    .from("profile_top8")
    .select("slots")
    .eq("owner_fid", ownerFid)
    .maybeSingle();

  if (error || !data) return [];
  return parseStoredSlots(data.slots);
}

export async function loadTop8Slots(ownerFid: number): Promise<Top8Slot[]> {
  const rows = await loadTop8StoredSlots(ownerFid);
  return hydrateTop8Slots(rows);
}

export interface Top8SaveSlot {
  position: number;
  targetFid: number;
}

/** Replace owner's Top 8 — one upserted row (or delete when empty). */
export async function saveTop8Slots(
  ownerFid: number,
  slots: Top8SaveSlot[]
): Promise<Top8StoredSlot[]> {
  const sb = getSupabaseAdmin();
  if (!sb) throw new Error("Supabase not configured");

  const stored: Top8StoredSlot[] = slots.map((s) => ({
    position: s.position,
    target_fid: s.targetFid,
  }));

  if (stored.length === 0) {
    const { error } = await sb.from("profile_top8").delete().eq("owner_fid", ownerFid);
    if (error) throw error;
    return [];
  }

  const now = new Date().toISOString();
  const { error } = await sb.from("profile_top8").upsert(
    {
      owner_fid: ownerFid,
      slots: stored,
      updated_at: now,
    },
    { onConflict: "owner_fid" }
  );

  if (error) throw error;
  return stored;
}
