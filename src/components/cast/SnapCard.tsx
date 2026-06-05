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
      className="mt-2 flex flex-col rounded-xl border border-[var(--accent)]/30 overflow-hidden hover:border-[var(--accent)]/60 transition-colors bg-[var(--surface)]"
      onClick={(e) => e.stopPropagation()}
    >
      <div className="px-3 py-3 min-h-[4.5rem]">
        {isLoading && !subtitle && title === "Snap" ? (
          <div className="space-y-2 animate-pulse">
            <div className="h-3.5 w-2/3 rounded bg-[var(--surface-hover)]" />
            <div className="h-2.5 w-full rounded bg-[var(--surface-hover)]" />
          </div>
        ) : (
          <>
            <p className="text-sm font-semibold text-[var(--foreground)] leading-snug">{title}</p>
            {subtitle && (
              <p className="text-xs text-[var(--muted)] mt-1.5 line-clamp-3 leading-relaxed">
                {subtitle}
              </p>
            )}
          </>
        )}
        {buttons.length > 0 && (
          <div className="flex flex-col gap-2 mt-3">
            {buttons.map((label, i) => (
              <span
                key={label}
                className={
                  i === 0
                    ? "w-full text-center text-xs font-medium text-white py-2 rounded-lg bg-[var(--accent)]"
                    : "w-full text-center text-xs font-medium text-[var(--foreground)] py-2 rounded-lg border border-[var(--border)] bg-[var(--surface-hover)]"
                }
              >
                {label}
              </span>
            ))}
          </div>
        )}
      </div>
    </a>
  );
}
