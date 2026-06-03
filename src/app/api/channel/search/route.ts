import { NextRequest, NextResponse } from "next/server";
import { hsnap } from "@/lib/hypersnap";
import { getSession } from "@/lib/session";

export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const q = searchParams.get("q");

  if (!q) {
    return NextResponse.json({ channels: [] });
  }

  const data = await hsnap<{ channels: Record<string, unknown>[] }>(
    "/v2/farcaster/channel/search",
    { q, limit: 10 }
  );

  const channels = (data.channels ?? []).map((ch) => ({
    id: ch.id,
    name: ch.name,
    image_url: ch.image_url ?? null,
    follower_count: ch.follower_count ?? 0,
  }));
  return NextResponse.json({ channels });
}
