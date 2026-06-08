"use client";

import Image from "next/image";
import { useState } from "react";
import type { ProfileLink } from "@/lib/profileLinks";
import {
  shortenAddress,
  WALLET_CHAIN_ICON_URL,
  type ProfileWallet,
  type ProfileWalletChain,
} from "@/lib/profileWallets";

export function ProfileMetaSeparator() {
  return <span> · </span>;
}

export function ProfileMetaLinksRow({
  links,
  joined,
  align = "center",
}: {
  links: ProfileLink[];
  joined?: string | null;
  align?: "left" | "center";
}) {
  if (links.length === 0 && !joined) return null;

  return (
    <p
      className={`mt-3 text-xs text-[var(--muted)] w-full ${
        align === "left" ? "text-left" : "text-center"
      }`}
    >
      {links.map((link, index) => (
        <span key={link.href}>
          {index > 0 && <ProfileMetaSeparator />}
          <a
            href={link.href}
            target="_blank"
            rel="noopener noreferrer"
            className="text-[var(--accent)] hover:underline"
          >
            {link.kind === "url"
              ? link.label
              : link.kind === "twitter"
                ? `X ${link.label}`
                : `GitHub ${link.label}`}
          </a>
        </span>
      ))}
      {links.length > 0 && joined && <ProfileMetaSeparator />}
      {joined && <span>Joined {joined}</span>}
    </p>
  );
}

function WalletChainIcon({ chain }: { chain: ProfileWalletChain }) {
  return (
    <Image
      src={WALLET_CHAIN_ICON_URL[chain]}
      alt=""
      width={16}
      height={16}
      className="w-4 h-4 shrink-0 rounded-full object-cover"
      unoptimized
    />
  );
}

function CopyAddressButton({
  address,
  className = "",
}: {
  address: string;
  className?: string;
}) {
  const [copied, setCopied] = useState(false);

  async function copyAddress() {
    try {
      await navigator.clipboard.writeText(address);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* ignore */
    }
  }

  return (
    <button
      type="button"
      onClick={() => void copyAddress()}
      aria-label={copied ? "Copied" : "Copy address"}
      className={`p-1 rounded-md text-[var(--muted)] hover:text-[var(--foreground)] hover:bg-[var(--surface-hover)] transition-colors shrink-0 ${className}`}
    >
      {copied ? (
        <svg className="w-3.5 h-3.5 text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
        </svg>
      ) : (
        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"
          />
        </svg>
      )}
    </button>
  );
}

function ProfileWalletRow({ wallet }: { wallet: ProfileWallet }) {
  return (
    <li className="flex items-center gap-1.5 py-0.5 min-w-0">
      <WalletChainIcon chain={wallet.chain} />
      <span
        className="text-[10px] font-medium text-[var(--muted)] shrink-0 w-11 text-right"
        title={wallet.label}
      >
        {wallet.label}
      </span>
      <a
        href={wallet.href}
        target="_blank"
        rel="noopener noreferrer"
        className="text-[11px] font-mono text-[var(--accent)] hover:underline truncate min-w-0"
        title={wallet.address}
      >
        {shortenAddress(wallet.address)}
      </a>
      <CopyAddressButton address={wallet.address} className="!p-0.5" />
    </li>
  );
}

export function ProfileWalletsDropdown({
  wallets,
  fid,
}: {
  wallets: ProfileWallet[];
  fid?: number | null;
}) {
  if (wallets.length > 0) {
    return (
      <details className="group mt-1">
        <summary className="text-xs text-[var(--muted)] list-none cursor-pointer [&::-webkit-details-marker]:hidden">
          {fid != null && (
            <>
              <span className="font-mono">FID {fid}</span>
              <ProfileMetaSeparator />
            </>
          )}
          <span className="inline-flex items-center gap-0.5 hover:text-[var(--foreground)] transition-colors">
            Wallets ({wallets.length})
            <svg
              className="w-3 h-3 transition-transform group-open:rotate-180"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
              aria-hidden
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </span>
        </summary>
        <ul className="mt-1 max-h-32 overflow-y-auto feed-scroll space-y-px">
          {wallets.map((wallet) => (
            <ProfileWalletRow key={wallet.id} wallet={wallet} />
          ))}
        </ul>
      </details>
    );
  }

  if (fid != null) {
    return (
      <p className="text-[10px] text-[var(--muted)] font-mono mt-1">FID {fid}</p>
    );
  }

  return null;
}
