"use client";

import { useSnapPreview } from "@/hooks/useSnapPreview";
import { castConversationUrl, normalizeSnapUrl } from "@/lib/snapEmbed";

interface SnapCardProps {
  /** Snap manifest URL (for preview text only). */
  url: string;
  /** Parent cast — link opens this cast on Farcaster, not the raw snap JSON. */
  castHash: string;
}

export function SnapCard({ url, castHash }: SnapCardProps) {
  const manifestUrl = normalizeSnapUrl(url);
  const castUrl = castConversationUrl(castHash);
  const { data, isLoading } = useSnapPreview(manifestUrl);
  const title = data?.title ?? "Snap";
  const subtitle = data?.subtitle;
  const buttons = data?.buttons ?? [];

  return (
    <a
      href={castUrl}
      target="_blank"
      rel="noopener noreferrer"
      className="mt-2 flex flex-col rounded-xl border border-[var(--accent)]/30 overflow-hidden hover:border-[var(--accent)]/60 transition-colors"
      onClick={(e) => e.stopPropagation()}
    >
      <div className="px-3 py-3 bg-[var(--surface-hover)] border-b border-[var(--border)]/60 min-h-[4.5rem]">
        {isLoading && !subtitle && title === "Snap" ? (
          <div className="h-3 w-2/3 rounded bg-[var(--border)] animate-pulse" />
        ) : (
          <>
            <p className="text-sm font-semibold text-[var(--foreground)] leading-snug">{title}</p>
            {subtitle && (
              <p className="text-xs text-[var(--muted)] mt-1 line-clamp-3 leading-relaxed">{subtitle}</p>
            )}
          </>
        )}
        {buttons.length > 0 && (
          <div className="flex gap-1.5 mt-2.5 flex-wrap">
            {buttons.map((label) => (
              <span
                key={label}
                className="text-xs px-2.5 py-1 rounded-lg border border-[var(--border)] text-[var(--muted)] bg-[var(--surface)]"
              >
                {label}
              </span>
            ))}
          </div>
        )}
      </div>
      <div className="flex items-center justify-between px-3 py-2 bg-[var(--surface)]">
        <span className="text-[10px] text-[var(--muted)] truncate">Open cast to interact</span>
        <span className="text-[10px] font-semibold text-[var(--accent)] shrink-0 ml-2 px-1.5 py-0.5 rounded-full border border-[var(--accent)]/40 bg-[var(--accent)]/10">
          Cast ↗
        </span>
      </div>
    </a>
  );
}
