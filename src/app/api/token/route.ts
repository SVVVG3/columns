import { NextRequest, NextResponse } from "next/server";
import { withCache } from "@/lib/feedCache";
import { parseTokenUrl } from "@/lib/tokenEmbed";

const TTL = 60_000; // 1 min — holder count / age can shift

export interface TokenData {
  name: string;
  ticker: string;
  imageUrl?: string;
  chain: string;
  ca: string;
  holderCount?: number;
  createdAt?: number;
  description?: string;
  url: string;
}

interface FcTokenResponse {
  result?: {
    token?: {
      name?: string;
      ticker?: string;
      imageUrl?: string;
      chain?: string;
      ca?: string;
      holderCount?: number;
      source?: { createdAt?: number };
      description?: string;
    };
  };
}

async function fetchToken(chain: string, ca: string, url: string): Promise<TokenData> {
  const apiUrl = new URL("https://api.farcaster.xyz/v2/token");
  apiUrl.searchParams.set("ca", ca);
  apiUrl.searchParams.set("chain", chain);

  const res = await fetch(apiUrl.toString(), {
    headers: { Accept: "application/json" },
    signal: AbortSignal.timeout(8000),
  });

  if (!res.ok) {
    throw new Error(`Farcaster token API ${res.status}`);
  }

  const data = (await res.json()) as FcTokenResponse;
  const t = data.result?.token;
  if (!t?.ticker) {
    throw new Error("Token not found");
  }

  return {
    name: t.name?.trim() || t.ticker,
    ticker: t.ticker,
    imageUrl: t.imageUrl,
    chain: t.chain ?? chain,
    ca: t.ca ?? ca,
    holderCount: t.holderCount,
    createdAt: t.source?.createdAt,
    description: t.description,
    url,
  };
}

export async function GET(req: NextRequest) {
  const url = new URL(req.url).searchParams.get("url");
  if (!url) {
    return NextResponse.json({ error: "url required" }, { status: 400 });
  }

  const parsed = parseTokenUrl(url);
  if (!parsed) {
    return NextResponse.json({ error: "valid token url required" }, { status: 400 });
  }

  try {
    const data = await withCache(
      `token:${parsed.chain}:${parsed.ca}`,
      TTL,
      () => fetchToken(parsed.chain, parsed.ca, url)
    );
    return NextResponse.json(data, {
      headers: { "Cache-Control": "public, max-age=60, stale-while-revalidate=300" },
    });
  } catch {
    return NextResponse.json(
      {
        name: "Token",
        ticker: parsed.ca.slice(0, 6).toUpperCase(),
        chain: parsed.chain,
        ca: parsed.ca,
        url,
      } satisfies TokenData,
      { status: 200 }
    );
  }
}
