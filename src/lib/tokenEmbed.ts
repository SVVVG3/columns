/** Farcaster coin URL — https://farcaster.xyz/~/c/{chain}:{contractAddress} */

import { chainIdToSlug } from "@/lib/eip155Token";

export { isEip155EmbedUri } from "@/lib/eip155Token";

const TOKEN_IN_TEXT_RE =
  /https?:\/\/(?:www\.)?(?:farcaster\.xyz|warpcast\.com)\/~\/c\/([a-z0-9_-]+):(0x[a-fA-F0-9]{40})\b[^\s]*/gi;

const CLANKER_URL_RE =
  /https?:\/\/(?:www\.)?clanker\.world\/clanker\/(0x[a-fA-F0-9]{40})\b/i;

export interface ParsedTokenUrl {
  chain: string;
  /** Token contract (Farcaster coin CA). */
  ca?: string;
  /** CAIP-style transaction reference — resolved to `ca` when possible. */
  txHash?: string;
}

/** Strip trailing sentence punctuation often glued to URLs in cast text. */
export function cleanTokenUrlCandidate(url: string): string {
  return url.replace(/[.,!?)\]]+$/, "").trim();
}

function parseEip155Uri(raw: string): ParsedTokenUrl | null {
  const cleaned = raw.replace(/^chain:\/\//i, "").trim();
  const tx = cleaned.match(/^eip155:(\d+)\/tx:(0x[a-fA-F0-9]{64})$/i);
  if (tx) {
    return { chain: chainIdToSlug(tx[1]), txHash: tx[2].toLowerCase() };
  }
  const erc20 = cleaned.match(/^eip155:(\d+)\/erc20:(0x[a-fA-F0-9]{40})$/i);
  if (erc20) {
    return { chain: chainIdToSlug(erc20[1]), ca: erc20[2] };
  }
  return null;
}

export function parseTokenUrl(url: string): ParsedTokenUrl | null {
  try {
    const cleaned = cleanTokenUrlCandidate(url);
    const eip = parseEip155Uri(cleaned);
    if (eip) return eip;

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
  if (parsed.ca) {
    return `https://farcaster.xyz/~/c/${parsed.chain}:${parsed.ca}`;
  }
  if (parsed.txHash) {
    const chainId =
      Object.entries({ "1": "ethereum", "8453": "base", "10": "optimism", "42161": "arbitrum" }).find(
        ([, slug]) => slug === parsed.chain
      )?.[0] ?? "8453";
    return `eip155:${chainId}/tx:${parsed.txHash}`;
  }
  return "";
}

/** Stable cache/fetch key for token cards. */
export function tokenCacheKey(parsed: ParsedTokenUrl): string {
  if (parsed.ca) return `${parsed.chain}:${parsed.ca.toLowerCase()}`;
  if (parsed.txHash) return `${parsed.chain}:tx:${parsed.txHash.toLowerCase()}`;
  return "";
}

export function isTokenEmbedUrl(url: string): boolean {
  return parseTokenUrl(url) !== null;
}

/** Token channel from cast parent_url / root_parent_url (eip155:chain/erc20:0x…). */
export function parseTokenParentUrl(
  cast: { parent_url?: string; root_parent_url?: string } | null | undefined
): ParsedTokenUrl | null {
  if (!cast) return null;
  for (const field of ["parent_url", "root_parent_url"] as const) {
    const raw = cast[field];
    if (!raw || typeof raw !== "string") continue;
    const parsed = parseEip155Uri(raw.replace(/^chain:\/\//i, "").trim());
    if (parsed?.ca) return parsed;
  }
  return null;
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
    const key = tokenCacheKey(parsed);
    if (seen.has(key)) return;
    seen.add(key);
    out.push(canonicalTokenUrl(parsed));
  };

  for (const e of embeds) {
    if (e.url) add(e.url);
  }

  if (text) {
    for (const m of text.matchAll(
      /(?:chain:\/\/)?eip155:\d+\/(?:tx|erc20):0x[a-fA-F0-9]+/gi
    )) {
      add(m[0]);
    }
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
  const key = tokenCacheKey(parsed);
  return tokenUrls.some((u) => {
    const p = parseTokenUrl(u);
    return p && tokenCacheKey(p) === key;
  });
}
