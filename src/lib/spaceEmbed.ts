/** Farcaster audio space URL — https://farcaster.xyz/~/spaces/{uuid} */
const SPACE_URL_RE =
  /^https?:\/\/(?:www\.)?(?:farcaster\.xyz|warpcast\.com)\/~\/spaces\/([0-9a-f-]{36})\/?/i;

export function parseSpaceId(url: string): string | null {
  try {
    return SPACE_URL_RE.exec(url)?.[1] ?? null;
  } catch {
    return null;
  }
}

export function isSpaceEmbedUrl(url: string): boolean {
  return parseSpaceId(url) !== null;
}
