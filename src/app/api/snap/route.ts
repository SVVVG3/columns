import { NextRequest, NextResponse } from "next/server";
import { withCache } from "@/lib/feedCache";
import {
  isSnapEmbedUrl,
  normalizeSnapUrl,
  parseSnapPreview,
  type SnapPreview,
} from "@/lib/snapEmbed";
import { fetchWithTimeout } from "@/lib/fetchWithTimeout";

const TTL = 60 * 60 * 1000;

export async function GET(req: NextRequest) {
  const raw = new URL(req.url).searchParams.get("url");
  if (!raw) {
    return NextResponse.json({ error: "url required" }, { status: 400 });
  }

  const url = normalizeSnapUrl(raw);
  if (!isSnapEmbedUrl(url)) {
    return NextResponse.json({ error: "not a snap URL" }, { status: 400 });
  }

  try {
    const preview = await withCache(`snap:${url}`, TTL, async (): Promise<SnapPreview> => {
      const res = await fetchWithTimeout(url, undefined, 8_000);
      if (!res.ok) throw new Error(`Snap manifest ${res.status}`);
      const manifest = (await res.json()) as Parameters<typeof parseSnapPreview>[0];
      return parseSnapPreview(manifest);
    });

    return NextResponse.json(preview, {
      headers: { "Cache-Control": "public, max-age=3600, stale-while-revalidate=86400" },
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[/api/snap]", url, msg);
    return NextResponse.json({ title: "Snap", buttons: [] } satisfies SnapPreview);
  }
}
