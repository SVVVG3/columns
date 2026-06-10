import { MAX_CAST_IMAGES } from "@/lib/castImageConstants";

/**
 * Max embeds per cast — matches our photo attachment limit.
 * Farcaster Pro hubs accept 4; free-tier hubs still cap at 2.
 * Neynar's OpenAPI still lists maxItems: 2 but Pro casts with 4 often succeed.
 */
export const MAX_CAST_EMBEDS = MAX_CAST_IMAGES;

const URL_RE = /https?:\/\/[^\s<>"']+/gi;

export type CastPublishEmbed =
  | { url: string }
  | { cast_id: { fid: number; hash: string }; castId?: { fid: number; hash: string } };

export function stripTrailingUrlPunctuation(url: string): string {
  return url.replace(/[.,!?)\]|;:]+$/, "");
}

function normalizeUrlKey(url: string): string {
  try {
    const u = new URL(url);
    u.hash = "";
    let path = u.pathname.replace(/\/+$/, "") || "";
    return `${u.protocol}//${u.host.toLowerCase()}${path}${u.search}`;
  } catch {
    return url.toLowerCase().replace(/\/+$/, "");
  }
}

/** HTTP(S) URLs in cast text — for the embeds array, not just inline text. */
export function extractUrlsFromCastText(text: string): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  const re = new RegExp(URL_RE.source, URL_RE.flags);
  let match: RegExpExecArray | null;
  while ((match = re.exec(text)) !== null) {
    const url = stripTrailingUrlPunctuation(match[0]);
    const key = normalizeUrlKey(url);
    if (!seen.has(key)) {
      seen.add(key);
      out.push(url);
    }
  }
  return out;
}

function isUrlEmbed(e: CastPublishEmbed): e is { url: string } {
  return "url" in e && typeof e.url === "string" && e.url.startsWith("http");
}

/**
 * Merge explicit embeds (quote, uploaded images) with http(s) URLs from text.
 * @mentions stay in cast text only — Farcaster links them without embed cards.
 *
 * Priority: explicit embeds first, then text URLs.
 */
export function buildCastPublishEmbeds(
  text: string,
  explicit: CastPublishEmbed[] = []
): CastPublishEmbed[] {
  const out: CastPublishEmbed[] = explicit.slice(0, MAX_CAST_EMBEDS);
  const usedUrlKeys = new Set(
    out.filter(isUrlEmbed).map((e) => normalizeUrlKey(e.url))
  );

  const addUrl = (url: string) => {
    if (out.length >= MAX_CAST_EMBEDS) return;
    const key = normalizeUrlKey(url);
    if (usedUrlKeys.has(key)) return;
    usedUrlKeys.add(key);
    out.push({ url });
  };

  for (const url of extractUrlsFromCastText(text)) addUrl(url);

  return out.slice(0, MAX_CAST_EMBEDS);
}
