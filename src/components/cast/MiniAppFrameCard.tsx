"use client";

import { useEffect, useState } from "react";
import type { TokenData } from "@/app/api/token/route";
import { useOgMetadata } from "@/hooks/useOgMetadata";
import { ogSeedFromEmbed } from "@/lib/ogLookup";
import { castConversationUrl } from "@/lib/snapEmbed";
import { canonicalTokenUrl, type ParsedTokenUrl } from "@/lib/tokenEmbed";
import { UserAvatar } from "@/components/ui/UserAvatar";

interface CastFrame {
  image?: string;
  title?: string;
  frames_url?: string;
  buttons?: Array<{ index: number; title: string }>;
}

interface EmbedLike {
  url?: string;
  metadata?: {
    html?: { ogImage?: Array<{ url?: string }>; ogTitle?: string };
  };
}

function formatUsdCompact(n?: number): string {
  if (n == null || Number.isNaN(n)) return "—";
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(n >= 10_000_000 ? 0 : 1)}M`;
  if (n >= 1_000) return `$${Math.round(n / 1_000)}K`;
  if (n >= 1) return `$${Math.round(n)}`;
  if (n >= 0.01) return `$${n.toFixed(2)}`;
  return `$${n.toFixed(4)}`;
}

function formatVolume(n?: number): string {
  if (n == null || Number.isNaN(n)) return "—";
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `$${Math.round(n / 1_000)}K`;
  return `$${Math.round(n)}`;
}

function FrameTokenStrip({ tokenParent }: { tokenParent: ParsedTokenUrl }) {
  const [token, setToken] = useState<TokenData | null>(null);
  const url = canonicalTokenUrl(tokenParent);

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

  const ticker = token?.ticker ? `$${token.ticker}` : "—";
  const change = token?.priceChangeH6;
  const changeUp = change != null && change >= 0;

  return (
    <div className="flex items-center gap-2 px-3 py-2.5 bg-[var(--surface-hover)] border-t border-[var(--border)]">
      <UserAvatar src={token?.imageUrl} alt={ticker} size="xs" />
      <div className="min-w-0 flex-1">
        <p className="text-xs font-semibold text-[var(--foreground)] truncate">{ticker}</p>
        <p className="text-[10px] text-[var(--muted)] truncate">
          {formatVolume(token?.volumeH6)} 6h vol
        </p>
      </div>
      <div className="text-right shrink-0">
        <p className="text-xs font-semibold text-[var(--foreground)]">
          {formatUsdCompact(token?.marketCap)}
        </p>
        {change != null && (
          <p
            className={`text-[10px] font-medium ${
              changeUp ? "text-emerald-400" : "text-red-400"
            }`}
          >
            {changeUp ? "▲" : "▼"} {Math.abs(change).toFixed(2)}%
          </p>
        )}
      </div>
    </div>
  );
}

/** Mini app / frame embed — 3:2 image, action button, optional token-channel strip. */
export function MiniAppFrameCard({
  embed,
  castHash,
  matchedFrame,
  tokenParent,
}: {
  embed: EmbedLike;
  castHash: string;
  matchedFrame?: CastFrame;
  tokenParent?: ParsedTokenUrl | null;
}) {
  const [imgFailed, setImgFailed] = useState(false);
  const seed = ogSeedFromEmbed(embed);
  const { data: og } = useOgMetadata(embed.url!, seed);

  const frameImg =
    matchedFrame?.image ??
    og?.frameImage ??
    og?.image ??
    embed.metadata?.html?.ogImage?.[0]?.url;
  const frameTitle =
    matchedFrame?.title ??
    og?.title ??
    embed.metadata?.html?.ogTitle ??
    "Mini App";

  const buttons =
    matchedFrame?.buttons && matchedFrame.buttons.length > 0
      ? matchedFrame.buttons.map((b) => b.title)
      : og?.frameButton
        ? [og.frameButton]
        : [];

  const castUrl = castConversationUrl(castHash);

  return (
    <a
      href={castUrl}
      target="_blank"
      rel="noopener noreferrer"
      className="mt-2 flex flex-col rounded-xl border border-[var(--accent)]/30 overflow-hidden hover:border-[var(--accent)]/60 transition-colors"
      onClick={(e) => e.stopPropagation()}
    >
      {frameImg && !imgFailed && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={frameImg}
          alt={frameTitle}
          onError={() => setImgFailed(true)}
          className="w-full aspect-[3/2] object-contain bg-white"
        />
      )}
      {buttons.map((title) => (
        <div key={title} className="px-3 py-2.5">
          <div className="w-full text-center text-xs font-medium text-[var(--accent)] py-1.5 rounded-lg border border-[var(--accent)]/40 bg-[var(--accent)]/10 hover:bg-[var(--accent)]/20 transition-colors">
            {title}
          </div>
        </div>
      ))}
      {tokenParent?.ca && <FrameTokenStrip tokenParent={tokenParent} />}
    </a>
  );
}
