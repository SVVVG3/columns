import { NextRequest, NextResponse } from "next/server";
import { withCache } from "@/lib/feedCache";
import { hsnap } from "@/lib/hypersnap";
import { parseSpaceId } from "@/lib/spaceEmbed";

const TTL = 30_000; // 30s — participant counts change frequently when live

export interface SpaceHost {
  fid: number;
  username: string;
  display_name: string;
  pfp_url?: string;
}

export interface SpaceData {
  spaceId: string;
  url: string;
  isLive: boolean;
  ended: boolean;
  title: string;
  description?: string;
  participantCount?: number;
  host?: SpaceHost;
}

function manifestHref(html: string): string {
  const re =
    /<link[^>]+rel=["']farcaster-live-activity-manifest["'][^>]+href=["']([^"']+)["']/i;
  const re2 =
    /<link[^>]+href=["']([^"']+)["'][^>]+rel=["']farcaster-live-activity-manifest["']/i;
  return (html.match(re) ?? html.match(re2))?.[1] ?? "";
}

async function titleFromManifest(manifestUrl: string): Promise<string> {
  try {
    const res = await fetch(manifestUrl, {
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) return "";
    const data = (await res.json()) as {
      metadata?: { title?: string };
      title?: string;
    };
    return data.metadata?.title?.trim() || data.title?.trim() || "";
  } catch {
    return "";
  }
}

function metaContent(html: string, prop: string): string {
  const re = new RegExp(
    `<meta[^>]+(?:property|name)=["']${prop}["'][^>]+content=["']([^"']+)["']`,
    "i"
  );
  const re2 = new RegExp(
    `<meta[^>]+content=["']([^"']+)["'][^>]+(?:property|name)=["']${prop}["']`,
    "i"
  );
  return (html.match(re) ?? html.match(re2))?.[1] ?? "";
}

async function scrapeSpaceHtml(url: string): Promise<string> {
  const res = await fetch(url, {
    headers: {
      "User-Agent": "facebookexternalhit/1.1",
      Accept: "text/html,application/xhtml+xml",
    },
    signal: AbortSignal.timeout(8000),
    redirect: "follow",
  });
  if (!res.ok) return "";
  const reader = res.body?.getReader();
  if (!reader) return "";
  const decoder = new TextDecoder();
  let html = "";
  while (html.length < 120_000) {
    const { done, value } = await reader.read();
    if (done) break;
    html += decoder.decode(value, { stream: true });
    if (/<\/head>/i.test(html)) break;
  }
  reader.cancel();
  return html;
}

async function lookupHost(fid: number): Promise<SpaceHost | undefined> {
  try {
    const data = await hsnap<{ user: SpaceHost & { object?: string } }>(
      "/v2/farcaster/user",
      { fid }
    );
    const u = data.user;
    if (!u?.fid) return undefined;
    return {
      fid: u.fid,
      username: u.username,
      display_name: u.display_name ?? u.username,
      pfp_url: u.pfp_url,
    };
  } catch {
    return undefined;
  }
}

async function resolveSpace(url: string, hostFidHint?: number): Promise<SpaceData> {
  const spaceId = parseSpaceId(url)!;
  const html = await scrapeSpaceHtml(url);

  const fcLive = metaContent(html, "fc:live");
  const hostFidRaw = metaContent(html, "fc:live:hostFid");
  const endedAt = metaContent(html, "fc:live:endedAt");
  const participantRaw = metaContent(html, "fc:live:participantCount");
  const ogTitle = metaContent(html, "og:title");
  const ogDesc = metaContent(html, "og:description");

  const isLive = fcLive === "1" && !endedAt;
  const ended = !!endedAt;
  const hostFid = hostFidRaw ? parseInt(hostFidRaw, 10) : hostFidHint;
  const participantCount = participantRaw ? parseInt(participantRaw, 10) : undefined;

  const manifestUrl = manifestHref(html);
  const manifestTitle = manifestUrl ? await titleFromManifest(manifestUrl) : "";

  let title = manifestTitle || ogTitle?.trim() || "";
  if (
    !title ||
    /^farcaster:/i.test(title) ||
    /^spaces$/i.test(title) ||
    /decentralized social network/i.test(title)
  ) {
    // Title lives on the space page (og:title / fc:live meta) when the session is
    // active. Ended spaces and bot scrapes often get the generic SPA shell instead.
    title = isLive ? "Live Space" : "Audio Space";
  }

  let host: SpaceHost | undefined;
  if (hostFid && !Number.isNaN(hostFid)) {
    host = await lookupHost(hostFid);
  }

  return {
    spaceId,
    url,
    isLive,
    ended,
    title,
    description: ogDesc || undefined,
    participantCount:
      participantCount !== undefined && !Number.isNaN(participantCount)
        ? participantCount
        : undefined,
    host,
  };
}

export async function GET(req: NextRequest) {
  const url = new URL(req.url).searchParams.get("url");
  if (!url || !parseSpaceId(url)) {
    return NextResponse.json({ error: "valid space url required" }, { status: 400 });
  }

  const hostFidHint = Number(new URL(req.url).searchParams.get("hostFid")) || undefined;

  try {
    const cacheKey = `space:${url}:${hostFidHint ?? ""}`;
    const data = await withCache(cacheKey, TTL, () => resolveSpace(url, hostFidHint));
    return NextResponse.json(data, {
      headers: { "Cache-Control": "public, max-age=30, stale-while-revalidate=60" },
    });
  } catch {
    const spaceId = parseSpaceId(url)!;
    return NextResponse.json(
      {
        spaceId,
        url,
        isLive: false,
        ended: false,
        title: "Audio Space",
      } satisfies SpaceData,
      { status: 200 }
    );
  }
}
