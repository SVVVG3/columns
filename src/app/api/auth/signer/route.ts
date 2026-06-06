import { NextRequest, NextResponse } from "next/server";
import { createAndRegisterAppSigner } from "@/lib/appSigner";
import { neynar } from "@/lib/neynar";
import { lookupUserByFid } from "@/lib/userSearch";

/** POST /api/auth/signer — create signer registered under @columns app FID */
export async function POST() {
  try {
    const signer = await createAndRegisterAppSigner();
    return NextResponse.json({
      signer_uuid: signer.signer_uuid,
      status: signer.status,
      signer_approval_url: signer.signer_approval_url ?? null,
      fid: signer.fid ?? null,
    });
  } catch (err) {
    console.error("[auth/signer] create failed:", err);
    const message =
      err instanceof Error ? err.message : "Failed to create signer";
    const isConfig =
      message.includes("FARCASTER_DEVELOPER") ||
      message.includes("custody") ||
      message.includes("FID");
    return NextResponse.json(
      { error: isConfig ? "signer_not_configured" : "signer_create_failed", message },
      { status: isConfig ? 503 : 500 }
    );
  }
}

/** GET /api/auth/signer?signer_uuid=... — poll approval; includes user when approved */
export async function GET(req: NextRequest) {
  const signerUuid = req.nextUrl.searchParams.get("signer_uuid")?.trim();
  if (!signerUuid) {
    return NextResponse.json({ error: "signer_uuid is required" }, { status: 400 });
  }

  try {
    const signer = await neynar.lookupSigner({ signerUuid });
    const payload: Record<string, unknown> = {
      signer_uuid: signer.signer_uuid,
      status: signer.status,
      signer_approval_url: signer.signer_approval_url ?? null,
      fid: signer.fid ?? null,
    };

    if (signer.status === "approved" && signer.fid) {
      const user = await lookupUserByFid(signer.fid);
      if (user) {
        payload.user = {
          fid: user.fid,
          username: user.username ?? "",
          displayName: user.display_name ?? user.username ?? "",
          pfpUrl: user.pfp_url ?? "",
        };
      }
    }

    return NextResponse.json(payload);
  } catch (err) {
    console.error("[auth/signer] lookup failed:", err);
    return NextResponse.json({ error: "signer_lookup_failed" }, { status: 500 });
  }
}
