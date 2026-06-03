import { NextRequest, NextResponse } from "next/server";
import { fetchOG } from "@/app/api/og/fetchOg";
import { withCache } from "@/lib/feedCache";

export type { OGData } from "@/lib/ogLookup";

const TTL = 60 * 60 * 1000;

export async function GET(req: NextRequest) {
  const url = new URL(req.url).searchParams.get("url");
  if (!url) {
    return NextResponse.json({ error: "url required" }, { status: 400 });
  }

  try {
    const data = await withCache(`og:${url}`, TTL, () => fetchOG(url));
    return NextResponse.json(data, {
      headers: { "Cache-Control": "public, max-age=3600, stale-while-revalidate=86400" },
    });
  } catch {
    return NextResponse.json({}, { status: 200 });
  }
}
