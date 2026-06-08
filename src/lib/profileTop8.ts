import { hsnap } from "@/lib/hypersnap";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import type { Top8Slot } from "@/types";

export async function loadTop8Slots(ownerFid: number): Promise<Top8Slot[]> {
  const sb = getSupabaseAdmin();
  if (!sb) return [];

  const { data, error } = await sb
    .from("profile_top8")
    .select("position, target_fid")
    .eq("owner_fid", ownerFid)
    .order("position", { ascending: true });

  if (error || !data?.length) return [];

  const fids = [...new Set(data.map((r) => r.target_fid))].sort((a, b) => a - b);
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

  return data.map((row) => {
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
