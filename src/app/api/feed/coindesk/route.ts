import { NextRequest, NextResponse } from "next/server";
import { fetchCoinDeskNewsPage } from "@/lib/coindeskNews";
import { withCache } from "@/lib/feedCache";
import { getSession } from "@/lib/session";

const TTL = 90_000;

export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const cursor = searchParams.get("cursor") ?? undefined;
  const limit = Math.min(Math.max(Number(searchParams.get("limit")) || 20, 1), 50);
  const categories = searchParams.get("categories")?.split(",").filter(Boolean);

  const cacheKey = `coindesk:${cursor ?? ""}:${limit}:${categories?.join(",") ?? ""}`;

  try {
    const page = await withCache(cacheKey, TTL, () =>
      fetchCoinDeskNewsPage({ limit, cursor, categories })
    );
    return NextResponse.json(page);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "CoinDesk news failed";
    console.error("[/api/feed/coindesk]", message);
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
