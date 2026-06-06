import { NextRequest, NextResponse } from "next/server";
import { lookupHypersnapChannel } from "@/lib/hypersnapChannels";
import { apiErrorFromHypersnap } from "@/lib/hypersnap";
import { getSession } from "@/lib/session";

export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const q = new URL(req.url).searchParams.get("q")?.trim();
  if (!q) {
    return NextResponse.json({ error: "q required" }, { status: 400 });
  }

  try {
    const channel = await lookupHypersnapChannel(q);
    if (!channel) {
      return NextResponse.json({ error: "Channel not found" }, { status: 404 });
    }
    return NextResponse.json({ channel });
  } catch (err: unknown) {
    return apiErrorFromHypersnap(err, "[/api/channel/lookup]");
  }
}
