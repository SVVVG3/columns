import { NextRequest, NextResponse } from "next/server";
import { hsnap } from "@/lib/hypersnap";

interface CastReactionResponse {
  reactions?: Array<{
    reaction_type?: string;
    user?: Record<string, unknown>;
    timestamp?: number;
  }>;
  next?: { cursor?: string } | null;
}

export async function GET(req: NextRequest) {
  const params = new URL(req.url).searchParams;
  const hash = params.get("hash");
  const types = params.get("types") === "recasts" ? "recasts" : "likes";
  const fid = params.get("fid");
  const limit = Math.min(Number(params.get("limit") ?? 50) || 50, 100);

  if (!hash) {
    return NextResponse.json({ error: "hash required" }, { status: 400 });
  }

  const normalized = hash.startsWith("0x") ? hash : `0x${hash}`;

  try {
    const query: Record<string, string | number> = {
      hash: normalized,
      types,
      limit,
    };
    if (fid) query.fid = Number(fid);

    const data = await hsnap<CastReactionResponse>("/v2/farcaster/reaction/cast", query);
    return NextResponse.json(data, {
      headers: { "Cache-Control": "private, max-age=30" },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to load reactions";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
