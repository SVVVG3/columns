/** Farcaster coin URL — https://farcaster.xyz/~/c/{chain}:{contractAddress} */

const TOKEN_IN_TEXT_RE =
  /https?:\/\/(?:www\.)?(?:farcaster\.xyz|warpcast\.com)\/~\/c\/([a-z0-9_-]+):(0x[a-fA-F0-9]{40})\b[^\s]*/gi;

const CLANKER_URL_RE =
  /https?:\/\/(?:www\.)?clanker\.world\/clanker\/(0x[a-fA-F0-9]{40})\b/i;

export interface ParsedTokenUrl {
  chain: string;
  ca: string;
}

/** Strip trailing sentence punctuation often glued to URLs in cast text. */
export function cleanTokenUrlCandidate(url: string): string {
  return url.replace(/[.,!?)\]]+$/, "").trim();
}

export function parseTokenUrl(url: string): ParsedTokenUrl | null {
  try {
    const cleaned = cleanTokenUrlCandidate(url);
    const fc = cleaned.match(
      /^https?:\/\/(?:www\.)?(?:farcaster\.xyz|warpcast\.com)\/~\/c\/([a-z0-9_-]+):(0x[a-fA-F0-9]{40})(?:[/?#].*)?$/i
    );
    if (fc) return { chain: fc[1].toLowerCase(), ca: fc[2] };

    const clanker = cleaned.match(CLANKER_URL_RE);
    if (clanker) return { chain: "base", ca: clanker[1] };

    return null;
  } catch {
    return null;
  }
}

export function canonicalTokenUrl(parsed: ParsedTokenUrl): string {
  return `https://farcaster.xyz/~/c/${parsed.chain}:${parsed.ca}`;
}

export function isTokenEmbedUrl(url: string): boolean {
  return parseTokenUrl(url) !== null;
}

/** Collect token page URLs from embeds and cast text (Hypersnap often omits URL embeds). */
export function collectTokenEmbedUrls(
  embeds: Array<{ url?: string }>,
  text?: string
): string[] {
  const seen = new Set<string>();
  const out: string[] = [];

  const add = (raw: string) => {
    const parsed = parseTokenUrl(raw);
    if (!parsed) return;
    const key = `${parsed.chain}:${parsed.ca.toLowerCase()}`;
    if (seen.has(key)) return;
    seen.add(key);
    out.push(canonicalTokenUrl(parsed));
  };

  for (const e of embeds) {
    if (e.url) add(e.url);
  }

  if (text) {
    for (const m of text.matchAll(TOKEN_IN_TEXT_RE)) {
      add(m[0]);
    }
    for (const m of text.matchAll(/https?:\/\/(?:www\.)?clanker\.world\/clanker\/(0x[a-fA-F0-9]{40})\b[^\s]*/gi)) {
      add(m[0]);
    }
    // Launcher casts (e.g. clanker deploy bots) often only include `CA: 0x…` in text.
    const caLine = text.match(/\bCA:\s*(0x[a-fA-F0-9]{40})\b/i);
    if (caLine) {
      const chain = /\b(?:BASE|base|ethereum|ETH)\b/.test(text) ? "base" : "base";
      const key = `${chain}:${caLine[1].toLowerCase()}`;
      if (!seen.has(key)) {
        seen.add(key);
        out.push(canonicalTokenUrl({ chain, ca: caLine[1] }));
      }
    }
  }

  return out;
}

/** True if `url` refers to the same token as any URL in `tokenUrls`. */
export function isSameTokenUrl(url: string, tokenUrls: string[]): boolean {
  const parsed = parseTokenUrl(url);
  if (!parsed) return false;
  const key = `${parsed.chain}:${parsed.ca.toLowerCase()}`;
  return tokenUrls.some((u) => {
    const p = parseTokenUrl(u);
    return p && `${p.chain}:${p.ca.toLowerCase()}` === key;
  });
}
