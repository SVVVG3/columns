"use client";

import { useEffect, useRef } from "react";
import { UserAvatar } from "@/components/ui/UserAvatar";
import { useInfiniteQuery, useQueryClient } from "@tanstack/react-query";
import { useUiStore } from "@/store/ui";
import type { HypersnapNotification } from "@/lib/notifications";
import { profileSeedFromUnknown } from "@/lib/profilePreview";
import {
  aggregateNotificationKey,
  aggregateNotifications,
  formatNotificationTime,
  isCastTargetNotification,
  latestNotificationTimestampMs,
  notificationActionSuffix,
  notificationActor,
  notificationActorCount,
  notificationActorDisplayName,
  notificationCastHash,
} from "@/lib/notifications";
import { NotificationCastPreview } from "@/components/notifications/NotificationCastPreview";
import {
  fetchNotificationsListPage,
  type NotificationsListPage,
} from "@/lib/fetchNotifications";

function isFollowNotification(n: HypersnapNotification): boolean {
  return n.type === "follows" || n.type === "follow";
}

interface NotificationsPanelProps {
  open: boolean;
  /** Bumps when the user opens the modal — new React Query key each time. */
  listSession: number;
  onClose: () => void;
  viewerFid: number;
  /** Called after a successful fresh load — clears unread badge (ms = newest item). */
  onFreshLoad?: (latestMs: number) => void;
}

/** Notifications list body (used inside NotificationsModal). */
export function NotificationsPanel({
  open,
  listSession,
  onClose,
  viewerFid,
  onFreshLoad,
}: NotificationsPanelProps) {
  const queryClient = useQueryClient();
  const openConversation = useUiStore((s) => s.openConversation);
  const openProfilePreview = useUiStore((s) => s.openProfilePreview);
  const scrollRef = useRef<HTMLDivElement>(null);
  const loadMoreRef = useRef<HTMLDivElement>(null);
  const markedFreshRef = useRef(false);

  const {
    data,
    isLoading,
    isError,
    isFetching,
    isSuccess,
    isPlaceholderData,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    refetch,
  } = useInfiniteQuery({
    queryKey: ["notifications", viewerFid, "list", listSession],
    queryFn: async ({ pageParam }) =>
      fetchNotificationsListPage(pageParam as string | undefined),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => last.next?.cursor ?? undefined,
    placeholderData: () => {
      const peek = queryClient.getQueryData<{ notifications?: HypersnapNotification[] }>([
        "notifications",
        viewerFid,
        "peek",
      ]);
      const peekItems = peek?.notifications ?? [];
      if (peekItems.length === 0) return undefined;
      return {
        pages: [{ notifications: peekItems, next: null } satisfies NotificationsListPage],
        pageParams: [undefined],
      };
    },
    enabled: open && listSession > 0,
    staleTime: 0,
    gcTime: 0,
    refetchOnMount: "always",
    refetchOnWindowFocus: false,
    refetchInterval: open ? 60_000 : false,
  });

  const items = aggregateNotifications(
    data?.pages.flatMap((p) => p.notifications ?? []) ?? []
  );

  useEffect(() => {
    if (!open) {
      markedFreshRef.current = false;
      return;
    }
    markedFreshRef.current = false;
  }, [open, listSession]);

  useEffect(() => {
    if (!open || markedFreshRef.current) return;
    if (!isSuccess || isFetching || isPlaceholderData) return;
    markedFreshRef.current = true;
    const latestMs = latestNotificationTimestampMs(items);
    onFreshLoad?.(latestMs);
    void queryClient.invalidateQueries({
      queryKey: ["notifications", viewerFid, "peek"],
    });
  }, [
    open,
    isSuccess,
    isFetching,
    isPlaceholderData,
    items,
    onFreshLoad,
    queryClient,
    viewerFid,
  ]);

  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      const { profilePreview, selectedCastHash } = useUiStore.getState();
      if (profilePreview || selectedCastHash) return;
      onClose();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [open, onClose]);

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
    }
  }

  if (!open) return null;

  const showRefreshing = isFetching && items.length > 0 && !isPlaceholderData;
  const showSkeleton = items.length === 0 && (isLoading || isFetching);

  return (
    <div ref={scrollRef} className="flex-1 overflow-y-auto feed-scroll min-h-0 flex flex-col">
      {showRefreshing && (
        <p className="text-center text-[10px] text-[var(--muted)] py-1.5 shrink-0 border-b border-[var(--border)]">
          Updating…
        </p>
      )}

      {showSkeleton && (
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

      {!isError && !showSkeleton && items.length === 0 && isSuccess && !isFetching && (
        <div className="flex items-center justify-center py-16 px-4 text-sm text-[var(--muted)] text-center">
          No notifications yet.
        </div>
      )}

      {!showSkeleton &&
        items.map((n) => (
          <NotificationRow
            key={aggregateNotificationKey(n)}
            notification={n}
            onClick={() => handleClick(n)}
            onOpenProfile={(actor) => {
              const seed = profileSeedFromUnknown(actor);
              if (seed) openProfilePreview(seed);
            }}
          />
        ))}

      {isFetchingNextPage && (
        <p className="text-center text-xs text-[var(--muted)] py-3">Loading more…</p>
      )}
      <div ref={loadMoreRef} className="h-1 shrink-0" />
    </div>
  );
}

function NotificationRow({
  notification: n,
  onClick,
  onOpenProfile,
}: {
  notification: HypersnapNotification;
  onClick: () => void;
  onOpenProfile: (actor: Record<string, unknown>) => void;
}) {
  const actor = notificationActor(n);
  const pfp = actor?.pfp_url ?? actor?.pfpUrl ?? "";
  const clickable = !!notificationCastHash(n) || isFollowNotification(n);
  const showCastPreview = isCastTargetNotification(n) && !!n.cast;

  return (
    <div
      className={`w-full text-left px-3 py-3 border-b border-[var(--border)] transition-colors ${
        clickable ? "hover:bg-[var(--surface-hover)]" : ""
      }`}
    >
      <div
        role={clickable ? "button" : undefined}
        tabIndex={clickable ? 0 : undefined}
        onClick={clickable ? onClick : undefined}
        onKeyDown={
          clickable
            ? (e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  onClick();
                }
              }
            : undefined
        }
        className={clickable ? "cursor-pointer" : ""}
      >
        <div className="flex gap-2.5">
            <NotificationActorAvatar
            pfp={pfp}
            username={actor?.username as string | undefined}
            onOpenProfile={() => actor && onOpenProfile(actor as Record<string, unknown>)}
          />
          <div className="min-w-0 flex-1">
            <div className="flex items-baseline justify-between gap-2">
              <NotificationSummaryLine
                notification={n}
                onOpenProfile={() => actor && onOpenProfile(actor as Record<string, unknown>)}
              />
              <span className="text-[10px] text-[var(--muted)] shrink-0">
                {formatNotificationTime(n)}
              </span>
            </div>
          </div>
        </div>
      </div>
      {showCastPreview && (
        <div
          className={`pl-[46px] ${clickable ? "cursor-pointer" : ""}`}
          role={clickable ? "button" : undefined}
          tabIndex={clickable ? 0 : undefined}
          onClick={clickable ? onClick : undefined}
          onKeyDown={
            clickable
              ? (e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    onClick();
                  }
                }
              : undefined
          }
        >
          <NotificationCastPreview notification={n} />
        </div>
      )}
    </div>
  );
}

function NotificationActorAvatar({
  pfp,
  username,
  onOpenProfile,
}: {
  pfp: string;
  username?: string;
  onOpenProfile: () => void;
}) {
  return (
    <button
      type="button"
      title={username ? `@${username}` : "Profile"}
      onClick={(e) => {
        e.stopPropagation();
        onOpenProfile();
      }}
      className="shrink-0 rounded-full hover:ring-2 hover:ring-[var(--accent)] transition-shadow focus:outline-none"
    >
      <UserAvatar src={pfp} alt={username ? `@${username}` : ""} size="lg" />
    </button>
  );
}

function NotificationSummaryLine({
  notification: n,
  onOpenProfile,
}: {
  notification: HypersnapNotification;
  onOpenProfile: () => void;
}) {
  const actor = notificationActor(n);
  const name = notificationActorDisplayName(actor);
  const suffix = notificationActionSuffix(n, notificationActorCount(n));

  return (
    <p className="text-xs font-medium text-[var(--foreground)] leading-snug">
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          onOpenProfile();
        }}
        className="text-[var(--accent)] hover:underline focus:outline-none"
      >
        {name}
      </button>
      <span>{suffix}</span>
    </p>
  );
}
