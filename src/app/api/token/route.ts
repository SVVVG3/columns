import { NextRequest, NextResponse } from "next/server";
import { withCache } from "@/lib/feedCache";
import { parseTokenUrl, tokenCacheKey, type ParsedTokenUrl } from "@/lib/tokenEmbed";
import { resolveTokenCaFromTx } from "@/lib/resolveTokenFromTx";

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
  priceUsd?: number;
  marketCap?: number;
  volumeH6?: number;
  priceChangeH6?: number;
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
      priceUsd?: string;
      marketCap?: number;
      volume?: { h6?: number; h24?: number };
      priceChangePct?: { h6?: number; h24?: number };
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
  const ticker = t?.ticker?.trim();
  if (!t || !ticker) {
    throw new Error("Token not found");
  }

  return {
    name: t.name?.trim() || ticker,
    ticker,
    imageUrl: t.imageUrl,
    chain: t.chain ?? chain,
    ca: t.ca ?? ca,
    holderCount: t.holderCount,
    createdAt: t.source?.createdAt,
    description: t.description,
    url,
    priceUsd: t.priceUsd ? Number(t.priceUsd) : undefined,
    marketCap: t.marketCap,
    volumeH6: t.volume?.h6,
    priceChangeH6: t.priceChangePct?.h6,
  };
}

async function resolveParsed(parsed: ParsedTokenUrl): Promise<{ chain: string; ca: string } | null> {
  if (parsed.ca) return { chain: parsed.chain, ca: parsed.ca };
  const ca = await resolveTokenCaFromTx(parsed);
  if (!ca) return null;
  return { chain: parsed.chain, ca };
}

function fallbackToken(
  parsed: ParsedTokenUrl,
  url: string,
  ca: string,
  label?: string
): TokenData {
  const short = ca.slice(2, 8).toUpperCase();
  return {
    name: label ?? "Onchain token",
    ticker: label ? label.replace(/^\$/, "") : short,
    chain: parsed.chain,
    ca,
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

  const cacheKey = `token:${tokenCacheKey(parsed)}`;
  if (!cacheKey || cacheKey === "token:") {
    return NextResponse.json({ error: "valid token url required" }, { status: 400 });
  }

  try {
    const data = await withCache(cacheKey, TTL, async () => {
      const resolved = await resolveParsed(parsed);
      if (!resolved) {
        if (parsed.txHash) {
          return fallbackToken(parsed, url, parsed.txHash, "TX");
        }
        throw new Error("Token not found");
      }
      try {
        return await fetchToken(resolved.chain, resolved.ca, url);
      } catch {
        return fallbackToken(parsed, url, resolved.ca);
      }
    });
    return NextResponse.json(data, {
      headers: { "Cache-Control": "public, max-age=60, stale-while-revalidate=300" },
    });
  } catch {
    const ca = parsed.ca ?? parsed.txHash ?? "0x0";
    return NextResponse.json(fallbackToken(parsed, url, ca), { status: 200 });
  }
}
