export interface ProfileWallet {
  id: string;
  label: string;
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
    return `https://etherscan.io/address/${address}`;
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

  const add = (address: string, label: string) => {
    const key = address.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    wallets.push({
      id: `${label}-${address}`,
      label,
      address,
      href: walletExplorerUrl(address),
    });
  };

  const custody = raw.custodyAddress?.trim();
  if (custody) add(custody, "Custody");

  const va = raw.verifiedAddresses;
  const primaryEth = va?.primary?.eth_address?.trim();
  const primarySol = va?.primary?.sol_address?.trim();
  if (primaryEth) add(primaryEth, "Primary ETH");
  if (primarySol) add(primarySol, "Primary SOL");

  for (const addr of va?.eth_addresses ?? []) {
    const a = addr?.trim();
    if (a) add(a, "Verified ETH");
  }
  for (const addr of va?.sol_addresses ?? []) {
    const a = addr?.trim();
    if (a) add(a, "Verified SOL");
  }

  return wallets;
}
