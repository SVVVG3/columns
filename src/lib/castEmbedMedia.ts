/** Lightweight image URL extraction for compact cast previews (notifications, etc.). */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type EmbedLike = { url?: string; metadata?: { content_type?: string } };

const IMAGE_CDN_HOST =
  /(?:^|\.)(?:imagedelivery\.net|images\.warpcast\.com|res\.cloudinary\.com|i\.imgur\.com|pbs\.twimg\.com|media\.tenor\.com|pinata\.cloud)$/i;

/** Whether a cast embed URL should render as an inline image (not a link card). */
export function isImageEmbedUrl(url: string, contentType?: string): boolean {
  if (!url) return false;
  if (/\.(jpg|jpeg|png|gif|webp|avif|svg)(\?.*)?$/i.test(url)) return true;
  if (contentType?.startsWith("image/")) return true;
  try {
    const u = new URL(url);
    if (IMAGE_CDN_HOST.test(u.hostname)) return true;
    // gateway.pinata.cloud/ipfs/… has no file extension but is almost always an image in casts
    if (/pinata\.cloud$/i.test(u.hostname) && u.pathname.startsWith("/ipfs/")) return true;
  } catch {
    /* ignore */
  }
  return false;
}

/** Up to 4 image URLs from cast embeds for thumbnail previews. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function extractCastImageUrls(cast: Record<string, any> | null | undefined): string[] {
  if (!cast) return [];
  const embeds = (cast.embeds as EmbedLike[] | undefined) ?? [];
  const urls: string[] = [];
  for (const e of embeds) {
    const url = e.url;
    if (!url || !isImageEmbedUrl(url, e.metadata?.content_type)) continue;
    if (!urls.includes(url)) urls.push(url);
    if (urls.length >= 4) break;
  }
  return urls;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function castPreviewText(cast: Record<string, any> | null | undefined, maxLen = 280): string {
  const text = (cast?.text ?? "").trim().replace(/\s+/g, " ");
  if (!text) return "";
  return text.length > maxLen ? `${text.slice(0, maxLen)}…` : text;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function castAuthorLabel(cast: Record<string, any> | null | undefined): string {
  const author = cast?.author as Record<string, unknown> | undefined;
  if (!author) return "";
  const name =
    (author.display_name as string) ??
    (author.displayName as string) ??
    (author.username as string);
  return name ? String(name) : "";
}
