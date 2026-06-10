import { getSupabaseAdmin } from "@/lib/supabaseAdmin";

export async function upsertColumnsUser(params: {
  fid: number;
  username?: string;
  displayName?: string;
  /**
   * Full Columns app sign-in (allowlisted + managed signer).
   * When true, grants the Columns Pro badge. Profile-only mini app users must not pass this.
   */
  grantBadge?: boolean;
}): Promise<void> {
  const sb = getSupabaseAdmin();
  if (!sb) return;

  const now = new Date().toISOString();
  const row = {
    fid: params.fid,
    username: params.username ?? null,
    display_name: params.displayName ?? null,
    last_seen_at: now,
  };

  if (params.grantBadge === true) {
    const { error } = await sb.from("columns_users").upsert(
      { ...row, show_columns_badge: true },
      { onConflict: "fid" }
    );
    if (error) console.error("[columnsRegistry] upsert failed:", error.message);
    return;
  }

  // Profile-only / Top 8: ensure row exists (FK) but never grant or revoke badge.
  const { data: existing } = await sb
    .from("columns_users")
    .select("fid")
    .eq("fid", params.fid)
    .maybeSingle();

  if (existing) {
    const { error } = await sb.from("columns_users").update(row).eq("fid", params.fid);
    if (error) console.error("[columnsRegistry] update failed:", error.message);
    return;
  }

  const { error } = await sb.from("columns_users").insert({
    ...row,
    show_columns_badge: false,
  });
  if (error) console.error("[columnsRegistry] insert failed:", error.message);
}

export async function getColumnsUserBadge(fid: number): Promise<{
  isColumnsUser: boolean;
  showBadge: boolean;
}> {
  const sb = getSupabaseAdmin();
  if (!sb) return { isColumnsUser: false, showBadge: false };

  const { data, error } = await sb
    .from("columns_users")
    .select("fid, show_columns_badge")
    .eq("fid", fid)
    .maybeSingle();

  if (error) {
    console.error("[columnsRegistry] badge lookup failed:", error.message);
    return { isColumnsUser: false, showBadge: false };
  }

  return {
    isColumnsUser: !!data,
    showBadge: data?.show_columns_badge ?? false,
  };
}

/** Batch badge lookup for OG images (Top 8 slots). */
export async function getColumnsUserBadges(
  fids: number[]
): Promise<Map<number, boolean>> {
  const map = new Map<number, boolean>();
  if (fids.length === 0) return map;

  const sb = getSupabaseAdmin();
  if (!sb) return map;

  const unique = [...new Set(fids)];
  const { data, error } = await sb
    .from("columns_users")
    .select("fid, show_columns_badge")
    .in("fid", unique);

  if (error) {
    console.error("[columnsRegistry] batch badge lookup failed:", error.message);
    return map;
  }

  for (const row of data ?? []) {
    map.set(row.fid, row.show_columns_badge ?? false);
  }
  return map;
}
