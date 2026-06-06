import { NextRequest, NextResponse } from "next/server";
import { searchHypersnapChannels } from "@/lib/hypersnapChannels";
import { apiErrorFromHypersnap } from "@/lib/hypersnap";
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

  try {
    const channels = await searchHypersnapChannels(q, 10);
    return NextResponse.json({ channels });
  } catch (err: unknown) {
    return apiErrorFromHypersnap(err, "[/api/channel/search]");
  }
}
