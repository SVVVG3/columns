"use client";

import Image from "next/image";
import { useQuery } from "@tanstack/react-query";
import type { HypersnapNotification } from "@/lib/notifications";
import {
  isCastTargetNotification,
  isQuoteCastNotification,
  isThreadReplyNotification,
  notificationParentHash,
} from "@/lib/notifications";
import {
  castAuthorLabel,
  castPreviewText,
  extractCastImageUrls,
} from "@/lib/castEmbedMedia";

interface NotificationCastPreviewProps {
  notification: HypersnapNotification;
}

export function NotificationCastPreview({
  notification: n,
}: NotificationCastPreviewProps) {
  if (!isCastTargetNotification(n) || !n.cast) return null;

  const parentHash = isThreadReplyNotification(n) ? notificationParentHash(n) : null;
  const isQuote = isQuoteCastNotification(n);
  const isThreadReply = isThreadReplyNotification(n);

  return (
    <div className="mt-2 space-y-1.5">
      {parentHash && <ParentCastPreview parentHash={parentHash} />}
      <CastPreviewCard
        cast={n.cast}
        label={isQuote ? "Quote" : isThreadReply ? "Reply" : "Your cast"}
        highlight={isQuote || isThreadReply}
      />
    </div>
  );
}

function ParentCastPreview({ parentHash }: { parentHash: string }) {
  const { data: cast, isLoading } = useQuery({
    queryKey: ["cast", parentHash, "notif-parent"],
    queryFn: async () => {
      const res = await fetch(`/api/cast/${encodeURIComponent(parentHash)}`);
      if (!res.ok) return null;
      return res.json() as Promise<Record<string, unknown>>;
    },
    staleTime: 120_000,
  });

  if (isLoading) {
    return (
      <div className="rounded-lg border border-[var(--border)] bg-[var(--surface)] px-2.5 py-2 animate-pulse">
        <div className="h-2 w-16 rounded bg-[var(--surface-hover)] mb-1.5" />
        <div className="h-2 w-full rounded bg-[var(--surface-hover)]" />
      </div>
    );
  }

  if (!cast) return null;

  return <CastPreviewCard cast={cast} label="Your cast" muted />;
}

function CastPreviewCard({
  cast,
  label,
  highlight,
  muted,
}: {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  cast: Record<string, any>;
  label: string;
  highlight?: boolean;
  muted?: boolean;
}) {
  const text = castPreviewText(cast);
  const images = extractCastImageUrls(cast);
  const author = castAuthorLabel(cast);
  const showAuthor = author && label !== "Your cast";

  return (
    <div
      className={`rounded-lg border overflow-hidden ${
        highlight
          ? "border-[var(--accent)]/40 bg-[var(--accent)]/5"
          : muted
            ? "border-[var(--border)] bg-[var(--surface-hover)]/40"
            : "border-[var(--border)] bg-[var(--surface)]"
      }`}
    >
      <div className="px-2.5 py-2">
        <p className="text-[10px] font-medium text-[var(--muted)] uppercase tracking-wide">
          {label}
          {showAuthor ? (
            <span className="normal-case tracking-normal font-normal">
              {" "}
              · {author}
            </span>
          ) : null}
        </p>
        {text ? (
          <p className="text-xs text-[var(--foreground)] mt-1 leading-relaxed line-clamp-4 whitespace-pre-wrap break-words">
            {text}
          </p>
        ) : images.length === 0 ? (
          <p className="text-xs text-[var(--muted)] mt-1 italic">Media cast</p>
        ) : null}
      </div>
      {images.length > 0 && (
        <div
          className={`grid gap-px bg-[var(--border)] w-full ${
            images.length === 1 ? "grid-cols-1" : "grid-cols-2"
          }`}
        >
          {images.slice(0, images.length === 1 ? 1 : 2).map((url) => (
            <div
              key={url}
              className={`relative w-full bg-black/40 ${
                images.length === 1 ? "h-28" : "aspect-square max-h-28"
              }`}
            >
              <Image
                src={url}
                alt=""
                fill
                className="object-cover"
                sizes={images.length === 1 ? "320px" : "160px"}
                unoptimized
              />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
