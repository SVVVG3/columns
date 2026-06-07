"use client";

import { useEffect, useState } from "react";
import { UserAvatar } from "@/components/ui/UserAvatar";
import type { TokenData } from "@/app/api/token/route";
import { castConversationUrl } from "@/lib/snapEmbed";
import { parseTokenUrl } from "@/lib/tokenEmbed";

function formatTokenAge(createdAtMs?: number): string {
  if (!createdAtMs) return "—";
  const ageMs = Date.now() - createdAtMs;
  if (ageMs < 0) return "—";
  const mins = Math.floor(ageMs / 60_000);
  if (mins < 60) return `${Math.max(1, mins)}m`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d`;
  const months = Math.floor(days / 30);
  return `${months}mo`;
}

function formatBuyers(count?: number): string {
  if (count === undefined || count === null) return "—";
  if (count === 0) return "—";
  if (count >= 1_000_000) return `${(count / 1_000_000).toFixed(1)}M`;
  if (count >= 1_000) return `${(count / 1_000).toFixed(1)}K`;
  return String(count);
}

function tokenHref(url: string, castHash?: string): string {
  if (castHash) return castConversationUrl(castHash);
  const parsed = parseTokenUrl(url);
  if (parsed?.ca) {
    return `https://farcaster.xyz/~/c/${parsed.chain}:${parsed.ca}`;
  }
  return url;
}

export function TokenCard({ url, castHash }: { url: string; castHash?: string }) {
  const [token, setToken] = useState<TokenData | null>(null);
  const href = tokenHref(url, castHash);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/token?url=${encodeURIComponent(url)}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (!cancelled && data) setToken(data);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [url]);

  const loading = token === null;
  const name = token?.name ?? "";
  const ticker = token?.ticker ? `$${token.ticker}` : "—";

  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      onClick={(e) => e.stopPropagation()}
      className="mt-2 block rounded-xl border border-[var(--border)] bg-[var(--surface)] hover:bg-[var(--surface-hover)] transition-colors overflow-hidden"
    >
      <div className="px-3 py-2.5 flex items-center gap-2 border-b border-[var(--border)]">
        <UserAvatar src={token?.imageUrl} alt={name} size="token" />
        <div className="min-w-0 flex-1">
          {loading ? (
            <div className="h-3.5 w-28 rounded bg-[var(--surface-hover)] animate-pulse" />
          ) : (
            <p className="text-sm font-semibold text-[var(--foreground)] truncate flex items-center gap-1">
              {name}
              <svg className="w-3.5 h-3.5 text-blue-400 shrink-0" viewBox="0 0 24 24" fill="currentColor">
                <path d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
              </svg>
            </p>
          )}
        </div>
      </div>

      <div className="grid grid-cols-3 divide-x divide-[var(--border)]">
        <div className="px-3 py-2">
          <p className="text-[10px] uppercase tracking-wide text-[var(--muted)] mb-0.5">Ticker</p>
          {loading ? (
            <div className="h-3 w-16 rounded bg-[var(--surface-hover)] animate-pulse" />
          ) : (
            <p className="text-xs font-medium text-[var(--foreground)] truncate">{ticker}</p>
          )}
        </div>
        <div className="px-3 py-2">
          <p className="text-[10px] uppercase tracking-wide text-[var(--muted)] mb-0.5">Buyers</p>
          {loading ? (
            <div className="h-3 w-8 rounded bg-[var(--surface-hover)] animate-pulse" />
          ) : (
            <p className="text-xs font-medium text-[var(--foreground)]">
              {formatBuyers(token?.holderCount)}
            </p>
          )}
        </div>
        <div className="px-3 py-2">
          <p className="text-[10px] uppercase tracking-wide text-[var(--muted)] mb-0.5">Age</p>
          {loading ? (
            <div className="h-3 w-8 rounded bg-[var(--surface-hover)] animate-pulse" />
          ) : (
            <p className="text-xs font-medium text-[var(--foreground)]">
              {formatTokenAge(token?.createdAt)}
            </p>
          )}
        </div>
      </div>
    </a>
  );
}
