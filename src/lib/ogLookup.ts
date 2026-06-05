import { isImageEmbedUrl } from "@/lib/castEmbedMedia";
import { isSpaceEmbedUrl } from "@/lib/spaceEmbed";
import { isSnapEmbedUrl } from "@/lib/snapEmbed";
import { isEip155EmbedUri, isTokenEmbedUrl } from "@/lib/tokenEmbed";

export interface OGData {
  title?: string;
  description?: string;
  image?: string;
  siteName?: string;
  /** URL itself returns image/* (dynamic image APIs, no file extension). */
  isDirectImage?: boolean;
  isFrame?: boolean;
  frameImage?: string;
  frameButton?: string;
  tweetText?: string;
  tweetAuthor?: string;
  tweetHandle?: string;
  /** ISO timestamp when parsed from oEmbed; use with formatEmbedTime. */
  tweetDate?: string;
  /** Raw date label from oEmbed when ISO parse fails. */
  tweetDateLabel?: string;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type EmbedLike = { url?: string; metadata?: any };

function normalizeUrl(url: string): string {
  try {
    const u = new URL(url);
    return `${u.origin}${u.pathname}`.replace(/\/$/, "");
  } catch {
    return url;
  }
}

export function isMiniAppUrl(url: string): boolean {
  return /farcaster\.xyz\/miniapps\//i.test(url) || /warpcast\.com\/miniapps\//i.test(url);
}

function isImageUrl(url: string, e: EmbedLike): boolean {
  return isImageEmbedUrl(url, e.metadata?.content_type);
}

function isVideoUrl(url: string, e: EmbedLike): boolean {
  if (/\.(mp4|webm|mov|ogg|m3u8)(\?.*)?$/i.test(url)) return true;
  if (/stream\.farcaster\.xyz/i.test(url)) return true;
  if (/youtube\.com\/watch|youtu\.be\//i.test(url)) return true;
  if (e.metadata?.content_type?.startsWith("video/")) return true;
  return false;
}

/** True when cached/seed OG data is enough to render without a live fetch. */
export function ogSeedHasPreview(seed?: OGData): boolean {
  if (!seed) return false;
  return !!(seed.frameImage || seed.image || seed.frameButton || seed.isDirectImage);
}

/** Build OGData from Hypersnap embed metadata for instant preview. */
export function ogSeedFromEmbed(embed: EmbedLike): OGData | undefined {
  const html = embed.metadata?.html;
  const title = html?.ogTitle?.trim();
  const description = html?.ogDescription?.trim();
  const image = html?.ogImage?.[0]?.url;
  const isFrame =
    isMiniAppUrl(embed.url ?? "") ||
    !!embed.metadata?.miniapp ||
    (Array.isArray(embed.metadata?.frames) && embed.metadata.frames.length > 0);

  if (!title && !description && !image && !isFrame) return undefined;

  return {
    title,
    description,
    image,
    isFrame: isFrame || undefined,
    frameImage: isFrame ? image : undefined,
  };
}

/** Whether this embed still needs a live /api/og fetch (no full frame data on cast). */
export function embedNeedsOgFetch(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  cast: Record<string, any>,
  embed: EmbedLike
): boolean {
  const url = embed.url;
  if (!url) return false;
  if (isImageUrl(url, embed) || isVideoUrl(url, embed)) return false;
  if (
    isSpaceEmbedUrl(url) ||
    isTokenEmbedUrl(url) ||
    isEip155EmbedUri(url) ||
    isSnapEmbedUrl(url)
  ) {
    return false;
  }

  const castFrames: Array<{
    frames_url?: string;
    image?: string;
    title?: string;
    buttons?: unknown[];
  }> = cast.frames ?? [];
  const norm = normalizeUrl(url);
  const matched = castFrames.find(
    (f) => f.frames_url && normalizeUrl(f.frames_url) === norm
  );
  if (matched?.image && matched?.title) return false;

  const seed = ogSeedFromEmbed(embed);
  if (ogSeedHasPreview(seed)) return false;

  // Mini apps / frames: Hypersnap often ships only the URL — fetch fc:miniapp HTML.
  if (isMiniAppUrl(url) || seed?.isFrame) return true;

  if (matched?.image && seed?.title) return false;

  return true;
}

/** Unique embed URLs in a feed page that should be prefetched for OG / mini-app cards. */
export function collectOgUrlsFromCasts(
  casts: Record<string, unknown>[]
): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const cast of casts) {
    const embeds = (cast.embeds as EmbedLike[] | undefined) ?? [];
    for (const e of embeds) {
      if (!e.url || seen.has(e.url)) continue;
      if (!embedNeedsOgFetch(cast, e)) continue;
      seen.add(e.url);
      out.push(e.url);
    }
  }
  return out;
}
