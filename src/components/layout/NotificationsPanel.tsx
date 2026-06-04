"use client";

import Image from "next/image";
import { useEffect, useRef } from "react";
import { useInfiniteQuery } from "@tanstack/react-query";
import { useUiStore } from "@/store/ui";
import type { HypersnapNotification } from "@/lib/notifications";
import {
  aggregateNotificationKey,
  aggregateNotifications,
  formatNotificationSummary,
  formatNotificationTime,
  notificationActor,
  notificationCastHash,
  notificationCastPreview,
} from "@/lib/notifications";

function isFollowNotification(n: HypersnapNotification): boolean {
  return n.type === "follows" || n.type === "follow";
}

interface NotificationsPanelProps {
  open: boolean;
  onClose: () => void;
  viewerFid: number;
}

interface NotificationsResponse {
  notifications: HypersnapNotification[];
  next?: { cursor?: string } | null;
}

export function NotificationsPanel({ open, onClose, viewerFid }: NotificationsPanelProps) {
  const openConversation = useUiStore((s) => s.openConversation);
  const scrollRef = useRef<HTMLDivElement>(null);
  const loadMoreRef = useRef<HTMLDivElement>(null);

  const {
    data,
    isLoading,
    isError,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    refetch,
  } = useInfiniteQuery({
    queryKey: ["notifications", viewerFid, "list"],
    queryFn: async ({ pageParam }) => {
      const params = new URLSearchParams({ limit: "20" });
      if (pageParam) params.set("cursor", String(pageParam));
      const res = await fetch(`/api/notifications?${params}`);
      if (!res.ok) throw new Error("Failed to load notifications");
      return res.json() as Promise<NotificationsResponse>;
    },
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => last.next?.cursor ?? undefined,
    enabled: open,
    staleTime: 30_000,
    refetchInterval: open ? 60_000 : false,
  });

  const items = aggregateNotifications(
    data?.pages.flatMap((p) => p.notifications ?? []) ?? []
  );

  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [open, onClose]);

  useEffect(() => {
    if (!open) return;
    refetch();
  }, [open, refetch]);

  useEffect(() => {
    const el = loadMoreRef.current;
    const root = scrollRef.current;
    if (!el || !root || !hasNextPage || isFetchingNextPage) return;

    const obs = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) fetchNextPage();
      },
      { root, rootMargin: "120px" }
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, [hasNextPage, isFetchingNextPage, fetchNextPage, items.length]);

  function handleClick(n: HypersnapNotification) {
    if (isFollowNotification(n)) {
      const username = notificationActor(n)?.username;
      if (username) {
        window.open(`https://farcaster.xyz/${username}`, "_blank", "noopener,noreferrer");
      }
      return;
    }
    const hash = notificationCastHash(n);
    if (hash) {
      openConversation(hash);
      onClose();
    }
  }

  return (
    <>
      <div
        className={`absolute left-full top-0 bottom-0 w-[360px] flex flex-col bg-[var(--background)] border-r border-[var(--border)] shadow-xl z-50 transition-transform duration-200 ease-out ${
          open ? "translate-x-0" : "-translate-x-2 pointer-events-none opacity-0"
        }`}
        aria-hidden={!open}
      >
        <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--border)] shrink-0">
          <span className="text-sm font-semibold text-[var(--foreground)]">Notifications</span>
          <button
            type="button"
            onClick={onClose}
            className="text-[var(--muted)] hover:text-[var(--foreground)] transition-colors p-1 rounded-lg"
            title="Close (Esc)"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div ref={scrollRef} className="flex-1 overflow-y-auto feed-scroll">
          {isLoading && (
            <div className="flex flex-col gap-2 p-3">
              {[...Array(6)].map((_, i) => (
                <div key={i} className="flex gap-2.5 animate-pulse p-2">
                  <div className="w-9 h-9 rounded-full bg-[var(--surface-hover)] shrink-0" />
                  <div className="flex-1 space-y-2 pt-1">
                    <div className="h-2.5 w-32 rounded bg-[var(--surface-hover)]" />
                    <div className="h-2 w-full rounded bg-[var(--surface-hover)]" />
                  </div>
                </div>
              ))}
            </div>
          )}

          {isError && (
            <div className="flex flex-col items-center gap-2 py-12 px-4 text-center">
              <p className="text-sm text-red-400">Couldn&apos;t load notifications.</p>
              <button
                type="button"
                onClick={() => refetch()}
                className="text-xs text-[var(--accent)] hover:underline"
              >
                Try again
              </button>
            </div>
          )}

          {!isLoading && !isError && items.length === 0 && (
            <div className="flex items-center justify-center py-16 px-4 text-sm text-[var(--muted)] text-center">
              No notifications yet.
            </div>
          )}

          {items.map((n) => (
            <NotificationRow
              key={aggregateNotificationKey(n)}
              notification={n}
              onClick={() => handleClick(n)}
            />
          ))}

          {isFetchingNextPage && (
            <p className="text-center text-xs text-[var(--muted)] py-3">Loading more…</p>
          )}
          <div ref={loadMoreRef} className="h-1 shrink-0" />
        </div>
      </div>

      {open && (
        <button
          type="button"
          className="fixed inset-0 z-40 cursor-default"
          aria-label="Close notifications"
          onClick={onClose}
        />
      )}
    </>
  );
}

function NotificationRow({
  notification: n,
  onClick,
}: {
  notification: HypersnapNotification;
  onClick: () => void;
}) {
  const actor = notificationActor(n);
  const pfp = actor?.pfp_url ?? actor?.pfpUrl ?? "";
  const hash = notificationCastHash(n);
  const preview = notificationCastPreview(n);
  const clickable = !!hash || isFollowNotification(n);

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={!clickable}
      className={`w-full text-left flex gap-2.5 px-3 py-3 border-b border-[var(--border)] transition-colors ${
        clickable
          ? "hover:bg-[var(--surface-hover)] cursor-pointer"
          : "cursor-default opacity-90"
      }`}
    >
      {pfp ? (
        <Image
          src={pfp}
          alt=""
          width={36}
          height={36}
          className="rounded-full shrink-0 object-cover"
        />
      ) : (
        <div className="w-9 h-9 rounded-full bg-[var(--surface-hover)] shrink-0" />
      )}
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline justify-between gap-2">
          <p className="text-xs font-medium text-[var(--foreground)] leading-snug">
            {formatNotificationSummary(n)}
          </p>
          <span className="text-[10px] text-[var(--muted)] shrink-0">
            {formatNotificationTime(n)}
          </span>
        </div>
        {preview && (
          <p className="text-xs text-[var(--muted)] mt-1 line-clamp-2">{preview}</p>
        )}
      </div>
    </button>
  );
}
