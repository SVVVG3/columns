import type { ParsedTokenUrl } from "@/lib/tokenEmbed";

const TRANSFER_TOPIC =
  "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";
const ZERO_TOPIC =
  "0x0000000000000000000000000000000000000000000000000000000000000000";

const RPC_BY_CHAIN: Record<string, string> = {
  base: "https://mainnet.base.org",
  ethereum: "https://cloudflare-eth.com",
};

interface ReceiptLog {
  address?: string;
  topics?: string[];
}

/** Best-effort: find a Farcaster-registered token CA involved in this transaction. */
export async function resolveTokenCaFromTx(
  parsed: ParsedTokenUrl
): Promise<string | null> {
  if (!parsed.txHash || parsed.ca) return parsed.ca ?? null;

  const rpc = RPC_BY_CHAIN[parsed.chain];
  if (!rpc) return null;

  const hash = parsed.txHash.startsWith("0x") ? parsed.txHash : `0x${parsed.txHash}`;

  let receipt: { logs?: ReceiptLog[] } | null = null;
  try {
    const res = await fetch(rpc, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      signal: AbortSignal.timeout(10_000),
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "eth_getTransactionReceipt",
        params: [hash],
      }),
    });
    const body = (await res.json()) as { result?: { logs?: ReceiptLog[] } };
    receipt = body.result ?? null;
  } catch {
    return null;
  }

  const logs = receipt?.logs ?? [];
  const candidates: string[] = [];

  for (const log of logs) {
    if (!log.address) continue;
    if (log.topics?.[0] === TRANSFER_TOPIC && log.topics?.[1] === ZERO_TOPIC) {
      candidates.unshift(log.address);
      continue;
    }
    candidates.push(log.address);
  }

  const unique = [...new Set(candidates.map((a) => a.toLowerCase()))];

  for (const ca of unique) {
    const ticker = await fetchFcTicker(parsed.chain, ca);
    if (ticker) return ca;
  }

  return unique[0] ?? null;
}

async function fetchFcTicker(chain: string, ca: string): Promise<string | null> {
  try {
    const apiUrl = new URL("https://api.farcaster.xyz/v2/token");
    apiUrl.searchParams.set("ca", ca);
    apiUrl.searchParams.set("chain", chain);
    const res = await fetch(apiUrl.toString(), {
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(6000),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as {
      result?: { token?: { ticker?: string } };
    };
    const ticker = data.result?.token?.ticker?.trim();
    return ticker || null;
  } catch {
    return null;
  }
}
