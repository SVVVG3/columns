"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { UserAvatar } from "@/components/ui/UserAvatar";
import {
  useInfiniteQuery,
  useMutation,
  useQueries,
  useQueryClient,
  type InfiniteData,
} from "@tanstack/react-query";
import { useUiStore } from "@/store/ui";
import { profileSeedFromUnknown } from "@/lib/profilePreview";
import { miniappFetch } from "@/lib/miniappFetch";
import { ReplyModal } from "@/components/cast/ReplyModal";
import {
  applyReactionSplit,
  dedupeNotifications,
  formatRelativeTime,
  groupNotificationsForDisplay,
  latestNotificationTimestampMs,
  mergeNotificationsWithPeek,
  notificationActorDisplayName,
  notificationBodyText,
  notificationContextLine,
  notificationFeedSuffix,
  type HypersnapNotification,
  type NotificationActor,
  type NotificationFeedRow,
} from "@/lib/notifications";
import {
  fetchNotificationsListPage,
  type NotificationsListPage,
} from "@/lib/fetchNotifications";

async function reactionFids(hash: string, types: "likes" | "recasts"): Promise<number[]> {
  const res = await fetch(
    `/api/reaction/cast?hash=${encodeURIComponent(hash)}&types=${types}&limit=100`
  );
  if (!res.ok) throw new Error("Failed to load reactions");
  const data = (await res.json()) as {
    reactions?: Array<{ user?: { fid?: number } }>;
  };
  return (data.reactions ?? [])
    .map((reaction) => reaction.user?.fid)
    .filter((fid): fid is number => typeof fid === "number" && fid > 0);
}

/** One cast lookup: who liked it, and who recasted it. */
async function loadReactionSplit(hash: string): Promise<{ likes: number[]; recasts: number[] }> {
  const [likes, recasts] = await Promise.all([
    reactionFids(hash, "likes"),
    reactionFids(hash, "recasts"),
  ]);
  return { likes, recasts };
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
  const openReactionActors = useUiStore((s) => s.openReactionActors);
  const scrollRef = useRef<HTMLDivElement>(null);
  const loadMoreRef = useRef<HTMLDivElement>(null);
  const markedFreshRef = useRef(false);
  const listRetryRef = useRef(0);
  const peekSnapshotMsRef = useRef(0);

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
  } = useInfiniteQuery<
    NotificationsListPage,
    Error,
    InfiniteData<NotificationsListPage, string | undefined>,
    (string | number)[],
    string | undefined
  >({
    queryKey: ["notifications", viewerFid, "list", listSession],
    queryFn: ({ pageParam }) => fetchNotificationsListPage(pageParam),
    initialPageParam: undefined,
    getNextPageParam: (last) => last.next?.cursor ?? undefined,
    placeholderData: (): InfiniteData<NotificationsListPage, string | undefined> | undefined => {
      const peek = queryClient.getQueryData<{ notifications?: HypersnapNotification[] }>([
        "notifications",
        viewerFid,
        "peek",
      ]);
      const peekItems = peek?.notifications ?? [];
      if (peekItems.length === 0) return undefined;
      return {
        pages: [{ notifications: peekItems, next: null }],
        pageParams: [undefined],
      };
    },
    enabled: open && listSession > 0,
    staleTime: 0,
    gcTime: 0,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
    refetchInterval: open ? 60_000 : false,
  });

  const peekItems =
    queryClient.getQueryData<{ notifications?: HypersnapNotification[] }>([
      "notifications",
      viewerFid,
      "peek",
    ])?.notifications ?? [];

  const listItems = dedupeNotifications(
    data?.pages.flatMap((p) => p.notifications ?? []) ?? []
  );

  const items = mergeNotificationsWithPeek(listItems, peekItems);
  const grouped = useMemo(() => groupNotificationsForDisplay(items), [items]);
  const pendingHashes = useMemo(() => {
    const hashes: string[] = [];
    const seen = new Set<string>();
    for (const row of grouped) {
      if (!row.pendingSplit || !row.castHash || seen.has(row.castHash)) continue;
      seen.add(row.castHash);
      hashes.push(row.castHash);
    }
    return hashes;
  }, [grouped]);
  const splitQueries = useQueries({
    queries: pendingHashes.map((hash) => ({
      queryKey: ["notification-reaction-split", hash],
      queryFn: () => loadReactionSplit(hash),
      staleTime: 60_000,
      enabled: open,
    })),
  });
  const rows = useMemo(() => {
    const byHash = new Map<
      string,
      { likes: Set<number>; recasts: Set<number> } | "error" | "loading"
    >();
    pendingHashes.forEach((hash, index) => {
      const query = splitQueries[index];
      if (!query || query.isPending) {
        byHash.set(hash, "loading");
        return;
      }
      if (query.isError || !query.data) {
        byHash.set(hash, "error");
        return;
      }
      byHash.set(hash, {
        likes: new Set(query.data.likes),
        recasts: new Set(query.data.recasts),
      });
    });

    const resolved: NotificationFeedRow[] = [];
    for (const row of grouped) {
      if (!row.pendingSplit || !row.castHash) {
        resolved.push(row);
        continue;
      }
      const split = byHash.get(row.castHash);
      if (!split || split === "loading") {
        resolved.push(row);
        continue;
      }
      if (split === "error") {
        resolved.push({ ...row, pendingSplit: false });
        continue;
      }
      resolved.push(...applyReactionSplit(row, split.likes, split.recasts));
    }
    resolved.sort((a, b) => b.timestampMs - a.timestampMs);
    return resolved;
  }, [grouped, pendingHashes, splitQueries]);

  useEffect(() => {
    if (!open) {
      markedFreshRef.current = false;
      listRetryRef.current = 0;
      return;
    }
    markedFreshRef.current = false;
    listRetryRef.current = 0;
    const peek = queryClient.getQueryData<{ notifications?: HypersnapNotification[] }>([
      "notifications",
      viewerFid,
      "peek",
    ]);
    peekSnapshotMsRef.current = latestNotificationTimestampMs(peek?.notifications ?? []);
  }, [open, listSession, queryClient, viewerFid]);

  useEffect(() => {
    if (!open || markedFreshRef.current) return;
    if (!isSuccess || isFetching || isPlaceholderData) return;

    const listLatest = latestNotificationTimestampMs(listItems);
    const peekLatest = peekSnapshotMsRef.current;

    if (listLatest < peekLatest && listRetryRef.current < 2) {
      listRetryRef.current += 1;
      void refetch();
      return;
    }

    markedFreshRef.current = true;
    onFreshLoad?.(latestNotificationTimestampMs(items));
  }, [
    open,
    isSuccess,
    isFetching,
    isPlaceholderData,
    listItems,
    items,
    onFreshLoad,
    refetch,
  ]);

  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      const { profilePreviewStack, selectedCastHash, reactionActors } = useUiStore.getState();
      if (profilePreviewStack.length > 0 || selectedCastHash || reactionActors) return;
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
  }, [hasNextPage, isFetchingNextPage, fetchNextPage, rows.length]);

  function openRow(row: NotificationFeedRow) {
    if (row.kind === "follow") {
      const username = row.actors[0]?.username;
      if (typeof username === "string" && username) {
        window.open(`https://farcaster.xyz/${username}`, "_blank", "noopener,noreferrer");
      }
      return;
    }
    if (row.castHash) openConversation(row.castHash);
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
        rows.map((row) => (
          <NotificationRow
            key={row.key}
            row={row}
            viewerFid={viewerFid}
            onOpen={() => openRow(row)}
            onOpenProfile={(actor) => {
              const seed = profileSeedFromUnknown(actor);
              if (seed) openProfilePreview(seed);
            }}
            onShowReactionActors={() => {
              if ((row.kind !== "likes" && row.kind !== "recasts") || !row.castHash) return;
              openReactionActors({
                castHash: row.castHash,
                type: row.kind,
                seedActors: row.actors,
              });
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
  row,
  viewerFid,
  onOpen,
  onOpenProfile,
  onShowReactionActors,
}: {
  row: NotificationFeedRow;
  viewerFid: number;
  onOpen: () => void;
  onOpenProfile: (actor: NotificationActor) => void;
  onShowReactionActors: () => void;
}) {
  const actor = row.actors[0] ?? null;
  const name = notificationActorDisplayName(actor);
  const suffix = notificationFeedSuffix(row);
  const context = notificationContextLine(row, viewerFid);
  const body = notificationBodyText(row);
  const canOpen = row.kind === "follow" ? !!actor?.username : !!row.castHash;
  const canShowActors =
    (row.kind === "likes" || row.kind === "recasts") && row.actors.length > 1 && !!row.castHash;

  return (
    <div
      role={canOpen ? "button" : undefined}
      tabIndex={canOpen ? 0 : undefined}
      onClick={canOpen ? onOpen : undefined}
      onKeyDown={
        canOpen
          ? (e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                onOpen();
              }
            }
          : undefined
      }
      className={`w-full text-left px-3 py-2.5 border-b border-[var(--border)] transition-colors ${
        canOpen ? "hover:bg-[var(--surface-hover)] cursor-pointer" : ""
      }`}
    >
      <div className="flex gap-2.5">
        <ActorCluster actors={row.actors} onOpenProfile={onOpenProfile} />
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline justify-between gap-2">
            <p className="text-sm text-[var(--foreground)] leading-snug min-w-0">
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  if (actor) onOpenProfile(actor);
                }}
                className="font-medium text-[var(--accent)] hover:underline focus:outline-none"
              >
                {name}
              </button>
              {suffix ? (
                canShowActors ? (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      onShowReactionActors();
                    }}
                    className="hover:underline focus:outline-none"
                  >
                    {suffix}
                  </button>
                ) : (
                  <span>{suffix}</span>
                )
              ) : null}
            </p>
            <span className="text-[10px] text-[var(--muted)] shrink-0">
              {formatRelativeTime(row.timestampMs)}
            </span>
          </div>
          {context ? (
            <p className="text-xs text-[var(--muted)] mt-0.5">{context}</p>
          ) : null}
          {body ? (
            <p className="mt-1 text-sm text-[var(--foreground)] leading-snug line-clamp-3 break-words">
              {body}
            </p>
          ) : null}
          {(row.kind === "reply" || row.kind === "quote" || row.kind === "mention") && row.cast ? (
            <NotificationCastActions cast={row.cast} viewerFid={viewerFid} />
          ) : null}
        </div>
      </div>
    </div>
  );
}

function countField(value: unknown): number {
  return typeof value === "number" && value > 0 ? value : 0;
}

function formatActionCount(n: number): string {
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`;
  return String(n);
}

/** Like, recast, and reply on an incoming cast without leaving notifications. */
function NotificationCastActions({
  cast,
  viewerFid,
}: {
  cast: Record<string, any>;
  viewerFid: number;
}) {
  const queryClient = useQueryClient();
  const authorFid = cast.author?.fid as number | undefined;
  const hash = typeof cast.hash === "string" ? cast.hash : "";
  const viewer = (cast.viewer_context ?? {}) as {
    liked?: boolean;
    recasted?: boolean;
    replied?: boolean;
  };
  const reactions = (cast.reactions ?? {}) as { likes_count?: number; recasts_count?: number };
  const serverLiked = viewer.liked ?? false;
  const serverRecasted = viewer.recasted ?? false;
  const serverReplied = viewer.replied ?? false;
  const serverLikeCount = countField(reactions.likes_count);
  const serverRecastCount = countField(reactions.recasts_count);
  const replyCount = countField(cast.replies?.count);
  const [replyOpen, setReplyOpen] = useState(false);
  const [liked, setLiked] = useState(serverLiked);
  const [likeCount, setLikeCount] = useState(serverLikeCount);
  const [recasted, setRecasted] = useState(serverRecasted);
  const [recastCount, setRecastCount] = useState(serverRecastCount);
  const [replied, setReplied] = useState(serverReplied);

  useEffect(() => {
    setLiked(serverLiked);
  }, [serverLiked]);
  useEffect(() => {
    setLikeCount(serverLikeCount);
  }, [serverLikeCount]);
  useEffect(() => {
    setRecasted(serverRecasted);
  }, [serverRecasted]);
  useEffect(() => {
    setRecastCount(serverRecastCount);
  }, [serverRecastCount]);
  useEffect(() => {
    setReplied(serverReplied);
  }, [serverReplied]);

  const likeMutation = useMutation({
    mutationFn: async (currentlyLiked: boolean) => {
      const res = await miniappFetch("/api/reaction", {
        method: currentlyLiked ? "DELETE" : "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ type: "like", castHash: hash, castAuthorFid: authorFid }),
      });
      if (!res.ok) throw new Error("Reaction failed");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["feed"] });
    },
    onError: () => {
      setLiked(serverLiked);
      setLikeCount(serverLikeCount);
    },
  });

  const recastMutation = useMutation({
    mutationFn: async (currentlyRecasted: boolean) => {
      const res = await miniappFetch("/api/reaction", {
        method: currentlyRecasted ? "DELETE" : "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ type: "recast", castHash: hash, castAuthorFid: authorFid }),
      });
      if (!res.ok) throw new Error("Reaction failed");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["feed"] });
    },
    onError: () => {
      setRecasted(serverRecasted);
      setRecastCount(serverRecastCount);
    },
  });

  if (!hash) return null;

  function toggleLike() {
    if (!authorFid || likeMutation.isPending) return;
    const next = !liked;
    setLiked(next);
    setLikeCount((c) => Math.max(0, c + (next ? 1 : -1)));
    likeMutation.mutate(liked);
  }

  function toggleRecast() {
    if (!authorFid || recastMutation.isPending) return;
    const next = !recasted;
    setRecasted(next);
    setRecastCount((c) => Math.max(0, c + (next ? 1 : -1)));
    recastMutation.mutate(recasted);
  }

  return (
    <>
      <div
        className="flex items-center gap-4 mt-2"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          type="button"
          onClick={() => setReplyOpen(true)}
          className={`flex items-center gap-1 transition-colors ${
            replied ? "text-[var(--accent)]" : "text-[var(--muted)] hover:text-[var(--accent)]"
          }`}
          aria-label={replied ? "You replied" : "Reply"}
        >
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
          </svg>
          {replyCount > 0 ? <span className="text-xs">{formatActionCount(replyCount)}</span> : null}
        </button>
        <button
          type="button"
          onClick={toggleRecast}
          disabled={!authorFid}
          className={`flex items-center gap-1 transition-colors disabled:opacity-40 ${
            recasted ? "text-[var(--recast)]" : "text-[var(--muted)] hover:text-[var(--recast)]"
          }`}
          aria-label={recasted ? "Remove recast" : "Recast"}
        >
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
          </svg>
          {recastCount > 0 ? <span className="text-xs">{formatActionCount(recastCount)}</span> : null}
        </button>
        <button
          type="button"
          onClick={toggleLike}
          disabled={!authorFid}
          className={`flex items-center gap-1 transition-colors disabled:opacity-40 ${
            liked ? "text-[var(--like)]" : "text-[var(--muted)] hover:text-[var(--like)]"
          }`}
          aria-label={liked ? "Unlike" : "Like"}
        >
          <svg className="w-3.5 h-3.5" fill={liked ? "currentColor" : "none"} stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" />
          </svg>
          {likeCount > 0 ? <span className="text-xs">{formatActionCount(likeCount)}</span> : null}
        </button>
      </div>
      {replyOpen ? (
        <ReplyModal
          parentCast={cast}
          viewerFid={viewerFid}
          threadRootHash={typeof cast.parent_hash === "string" ? cast.parent_hash : hash}
          onPosted={() => setReplied(true)}
          onClose={() => setReplyOpen(false)}
        />
      ) : null}
    </>
  );
}

function ActorCluster({
  actors,
  onOpenProfile,
}: {
  actors: NotificationActor[];
  onOpenProfile: (actor: NotificationActor) => void;
}) {
  const shown = actors.slice(0, actors.length === 1 ? 1 : 4);
  if (shown.length === 0) {
    return <UserAvatar alt="" size="lg" />;
  }
  if (shown.length === 1) {
    const actor = shown[0];
    const username = typeof actor.username === "string" ? actor.username : undefined;
    return (
      <button
        type="button"
        title={username ? `@${username}` : "Profile"}
        onClick={(e) => {
          e.stopPropagation();
          onOpenProfile(actor);
        }}
        className="shrink-0 rounded-full hover:ring-2 hover:ring-[var(--accent)] transition-shadow focus:outline-none"
      >
        <UserAvatar
          src={(actor.pfp_url ?? actor.pfpUrl) as string | undefined}
          alt={username ? `@${username}` : ""}
          size="lg"
        />
      </button>
    );
  }

  return (
    <div className="flex shrink-0 items-center pl-0.5">
      {shown.map((actor, index) => {
        const username = typeof actor.username === "string" ? actor.username : undefined;
        return (
          <button
            key={typeof actor.fid === "number" ? actor.fid : `${username ?? "actor"}-${index}`}
            type="button"
            title={username ? `@${username}` : "Profile"}
            onClick={(e) => {
              e.stopPropagation();
              onOpenProfile(actor);
            }}
            className={`rounded-full ring-2 ring-[var(--surface)] focus:outline-none ${
              index === 0 ? "" : "-ml-2"
            }`}
          >
            <UserAvatar
              src={(actor.pfp_url ?? actor.pfpUrl) as string | undefined}
              alt=""
              size="sm"
            />
          </button>
        );
      })}
    </div>
  );
}
