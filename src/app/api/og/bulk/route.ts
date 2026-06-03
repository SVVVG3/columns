import { NextRequest, NextResponse } from "next/server";
import { fetchOG } from "@/app/api/og/fetchOg";
import { withCache } from "@/lib/feedCache";

const TTL = 60 * 60 * 1000;
const MAX_URLS = 24;
const CONCURRENCY = 6;

async function mapPool<T, R>(
  items: T[],
  limit: number,
  fn: (item: T) => Promise<R>
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let next = 0;
  async function worker() {
    while (next < items.length) {
      const i = next++;
      results[i] = await fn(items[i]);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}

export async function GET(req: NextRequest) {
  const raw = new URL(req.url).searchParams.get("urls") ?? "";
  const urls = raw
    .split(",")
    .map((u) => u.trim())
    .filter((u) => u.startsWith("http"))
    .slice(0, MAX_URLS);

  if (urls.length === 0) {
    return NextResponse.json({ ogs: {} });
  }

  const entries = await mapPool(urls, CONCURRENCY, async (url) => {
    try {
      const data = await withCache(`og:${url}`, TTL, () => fetchOG(url));
      return [url, data] as const;
    } catch {
      return [url, {}] as const;
    }
  });

  return NextResponse.json(
    { ogs: Object.fromEntries(entries) },
    {
      headers: { "Cache-Control": "public, max-age=3600, stale-while-revalidate=86400" },
    }
  );
}
