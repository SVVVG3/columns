import { getSupabaseAdmin } from "@/lib/supabaseAdmin";

export async function upsertColumnsUser(params: {
  fid: number;
  username?: string;
  displayName?: string;
}): Promise<void> {
  const sb = getSupabaseAdmin();
  if (!sb) return;

  const now = new Date().toISOString();
  const { error } = await sb.from("columns_users").upsert(
    {
      fid: params.fid,
      username: params.username ?? null,
      display_name: params.displayName ?? null,
      last_seen_at: now,
    },
    { onConflict: "fid", ignoreDuplicates: false }
  );

  if (error) {
    console.error("[columnsRegistry] upsert failed:", error.message);
  }
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
