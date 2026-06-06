export type ProfileWalletChain = "eth" | "sol";

export const WALLET_CHAIN_ICON_URL: Record<ProfileWalletChain, string> = {
  eth: "https://assets.coingecko.com/coins/images/279/small/ethereum.png",
  sol: "https://assets.coingecko.com/coins/images/4128/small/solana.png",
};

export interface ProfileWallet {
  id: string;
  /** Role label without chain name, e.g. Custody, Primary, Verified. */
  label: string;
  chain: ProfileWalletChain;
  address: string;
  href: string;
}

export function shortenAddress(address: string): string {
  if (address.length <= 12) return address;
  return `${address.slice(0, 6)}…${address.slice(-4)}`;
}

function isEthAddress(address: string): boolean {
  return /^0x[a-fA-F0-9]{40}$/.test(address);
}

function walletExplorerUrl(address: string): string {
  if (isEthAddress(address)) {
    return `https://basescan.org/address/${address}`;
  }
  return `https://solscan.io/account/${address}`;
}

/** Custody + verified ETH/SOL (primary first, deduped). */
export function buildProfileWallets(raw: {
  custodyAddress?: string;
  verifiedAddresses?: {
    eth_addresses?: string[];
    sol_addresses?: string[];
    primary?: { eth_address?: string; sol_address?: string };
  };
}): ProfileWallet[] {
  const seen = new Set<string>();
  const wallets: ProfileWallet[] = [];

  const add = (address: string, label: string, chain: ProfileWalletChain) => {
    const key = address.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    wallets.push({
      id: `${label}-${address}`,
      label,
      chain,
      address,
      href: walletExplorerUrl(address),
    });
  };

  const custody = raw.custodyAddress?.trim();
  if (custody) add(custody, "Custody", "eth");

  const va = raw.verifiedAddresses;
  const primaryEth = va?.primary?.eth_address?.trim();
  const primarySol = va?.primary?.sol_address?.trim();
  if (primaryEth) add(primaryEth, "Primary", "eth");
  if (primarySol) add(primarySol, "Primary", "sol");

  for (const addr of va?.eth_addresses ?? []) {
    const a = addr?.trim();
    if (a) add(a, "Verified", "eth");
  }
  for (const addr of va?.sol_addresses ?? []) {
    const a = addr?.trim();
    if (a) add(a, "Verified", "sol");
  }

  return wallets;
}
