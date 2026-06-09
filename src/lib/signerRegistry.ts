import { getSupabaseAdmin } from "@/lib/supabaseAdmin";

export type StoredSignerStatus =
  | "generated"
  | "pending_approval"
  | "approved"
  | "revoked";

export interface StoredUserSigner {
  signerUuid: string;
  status: StoredSignerStatus;
  publicKey: string | null;
}

async function ensureColumnsUserRow(fid: number): Promise<void> {
  const sb = getSupabaseAdmin();
  if (!sb) return;

  const { data: existing } = await sb
    .from("columns_users")
    .select("fid")
    .eq("fid", fid)
    .maybeSingle();

  if (existing) return;

  const { error } = await sb.from("columns_users").insert({
    fid,
    show_columns_badge: false,
  });
  if (error) {
    console.error("[signerRegistry] ensure columns_users failed:", error.message);
  }
}

/** Persist an approved Neynar managed signer for a user (server-only). */
export async function upsertUserSigner(params: {
  fid: number;
  signerUuid: string;
  status?: StoredSignerStatus;
  publicKey?: string | null;
}): Promise<void> {
  const sb = getSupabaseAdmin();
  if (!sb) return;

  await ensureColumnsUserRow(params.fid);

  const now = new Date().toISOString();
  const { error } = await sb.from("user_signers").upsert(
    {
      fid: params.fid,
      signer_uuid: params.signerUuid,
      status: params.status ?? "approved",
      public_key: params.publicKey ?? null,
      updated_at: now,
    },
    { onConflict: "fid" }
  );

  if (error) {
    console.error("[signerRegistry] upsert failed:", error.message);
  }
}

/** Return an approved signer for writes, or null if missing/revoked. */
export async function getApprovedSignerForFid(
  fid: number
): Promise<StoredUserSigner | null> {
  const sb = getSupabaseAdmin();
  if (!sb) return null;

  const { data, error } = await sb
    .from("user_signers")
    .select("signer_uuid, status, public_key")
    .eq("fid", fid)
    .eq("status", "approved")
    .maybeSingle();

  if (error) {
    console.error("[signerRegistry] lookup failed:", error.message);
    return null;
  }

  if (!data?.signer_uuid) return null;

  return {
    signerUuid: data.signer_uuid,
    status: data.status as StoredSignerStatus,
    publicKey: data.public_key ?? null,
  };
}

export async function markUserSignerRevoked(fid: number): Promise<void> {
  const sb = getSupabaseAdmin();
  if (!sb) return;

  const { error } = await sb
    .from("user_signers")
    .update({
      status: "revoked",
      updated_at: new Date().toISOString(),
    })
    .eq("fid", fid);

  if (error) {
    console.error("[signerRegistry] revoke update failed:", error.message);
  }
}
