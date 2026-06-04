/** Map EIP-155 chain id → slug used by Farcaster token API. */
const CHAIN_ID_TO_SLUG: Record<string, string> = {
  "1": "ethereum",
  "8453": "base",
  "10": "optimism",
  "42161": "arbitrum",
};

export function chainIdToSlug(chainId: string): string {
  return CHAIN_ID_TO_SLUG[chainId] ?? `eip155-${chainId}`;
}

export function isEip155EmbedUri(url: string): boolean {
  const s = url.replace(/^chain:\/\//i, "").trim();
  return /^eip155:\d+\/(?:tx|erc20):0x[a-fA-F0-9]+$/i.test(s);
}
