import { NextRequest, NextResponse } from "next/server";
import { withCache } from "@/lib/feedCache";

const TTL = 10 * 60 * 1000; // 10 min — Cloudflare Stream signed URLs expire, keep cache short

export interface VideoResolveData {
  /** Final URL after following redirects */
  finalUrl: string;
  /** Cloudflare Stream iframe embed URL, if the video is hosted there */
  iframeUrl?: string;
}

export async function GET(req: NextRequest) {
  const url = new URL(req.url).searchParams.get("url");
  if (!url) return NextResponse.json({ error: "url required" }, { status: 400 });

  try {
    const data = await withCache<VideoResolveData>(`video:${url}`, TTL, async () => {
      const res = await fetch(url, {
        method: "HEAD",
        redirect: "follow",
        signal: AbortSignal.timeout(5000),
      });
      const finalUrl = res.url || url;

      let iframeUrl: string | undefined;
      if (finalUrl.includes("cloudflarestream.com") && finalUrl.includes("/manifest/")) {
        iframeUrl = finalUrl.replace(/\/manifest\/video\.m3u8.*$/, "/iframe");
      }

      return { finalUrl, iframeUrl };
    });

    return NextResponse.json(data);
  } catch {
    return NextResponse.json({ finalUrl: url }, { status: 200 });
  }
}
