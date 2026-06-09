"use client";

import type React from "react";
import { useInfiniteQuery } from "@tanstack/react-query";
import { useCallback, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { useUiStore } from "@/store/ui";
import { CastCard } from "@/components/cast/CastCard";
import { NewsArticleCard } from "@/components/news/NewsArticleCard";
import { useFeedHeadRefresh } from "@/hooks/useFeedHeadRefresh";
import { isRootCast } from "@/lib/castFilters";
import {
  buildCastFeedUrl,
  buildNewsFeedUrl,
  isNewsFeedColumn,
} from "@/lib/feedColumnUrl";
import { MAX_FEED_CURSOR_BYTES } from "@/lib/feedPagination";
import type { NewsArticle, NewsFeedPage } from "@/lib/newsArticle";
import type { FeedColumnConfig } from "@/types";

export function RefreshButton({
  isFetching,
  onRefresh,
}: {
  isFetching: boolean;
  onRefresh: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onRefresh}
      disabled={isFetching}
      className="text-[var(--muted)] hover:text-[var(--foreground)] disabled:opacity-40 p-1.5 rounded-lg shrink-0"
      title="Refresh"
    >
      <svg
        className={`w-5 h-5 ${isFetching ? "animate-spin" : ""}`}
        fill="none"
        stroke="currentColor"
        viewBox="0 0 24 24"
        aria-hidden
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={2}
          d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
        />
      </svg>
    </button>
  );
}

export function MiniAppSingleColumnFeed({
  column,
  viewerFid,
  autoRefresh = true,
  renderHeader,
}: {
  column: FeedColumnConfig;
  viewerFid: number;
  /** When false, disable automatic head refresh (manual only). */
  autoRefresh?: boolean;
  /**
   * Optional render prop that replaces the default title+refresh header row.
   * Receives current fetching state and a refetch callback so the parent can
   * place the refresh button anywhere it likes (e.g. next to a dropdown).
   */
  renderHeader?: (isFetching: boolean, refetch: () => void) => React.ReactNode;
}) {
  const router = useRouter();
  const pushMiniAppProfile = useUiStore((s) => s.pushMiniAppProfile);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Persist scroll position so it can be restored when the user navigates back.
  const scrollKey = `col_scroll_${column.id}`;

  // Tapping a cast author navigates to their profile within the mini app.
  // Save the current scroll position before leaving so we can restore it.
  const handleAuthorClick = useCallback(
    (username: string) => {
      if (scrollRef.current) {
        sessionStorage.setItem(scrollKey, String(scrollRef.current.scrollTop));
      }
      pushMiniAppProfile("");
      router.push(`/profile/${encodeURIComponent(username)}`);
    },
    [pushMiniAppProfile, router, scrollKey]
  );

  const isNews = isNewsFeedColumn(column);

  const feedQueryKey = isNews
    ? (["miniapp-feed", column.type, column.id, column.rssUrl ?? ""] as const)
    : ([
        "miniapp-feed",
        column.type,
        column.channelIds,
        column.targetFids ?? column.targetFid,
        column.queries ?? column.query,
      ] as const);

  const headRefreshUrl = isNews
    ? buildNewsFeedUrl(column)
    : buildCastFeedUrl(column, undefined, true);

  const refreshInterval = column.refreshInterval ?? 60_000;

  const { data, error, fetchNextPage, hasNextPage, isFetchingNextPage, status, isFetching, refetch } =
    useInfiniteQuery({
      queryKey: feedQueryKey,
      queryFn: async ({ pageParam }) => {
        let cursor = pageParam as string | undefined;
        if (!isNews && cursor && cursor.length > MAX_FEED_CURSOR_BYTES) {
          cursor = undefined;
        }
        const url = isNews
          ? buildNewsFeedUrl(column, cursor)
          : buildCastFeedUrl(column, cursor);
        const res = await fetch(url);
        const json = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(json?.error ?? `Feed fetch failed: ${res.status}`);
        return json;
      },
      initialPageParam: undefined as string | undefined,
      getNextPageParam: (lastPage, allPages) => {
        const cursor = lastPage.next?.cursor;
        if (!cursor) return undefined;
        if (isNews) return cursor;

        const lastCasts = (lastPage.casts ?? []) as { hash?: string }[];
        if (lastCasts.length === 0) return undefined;
        const priorHashes = new Set(
          allPages
            .slice(0, -1)
            .flatMap((p) => ((p.casts ?? []) as { hash?: string }[]).map((c) => c.hash))
            .filter(Boolean)
        );
        const newCount = lastCasts.filter((c) => c.hash && !priorHashes.has(c.hash)).length;
        return newCount === 0 ? undefined : cursor;
      },
      staleTime: 30_000,
      // Only disable for RSS columns that are missing their feed URL.
      // CoinDesk (also isNews) has no rssUrl but is always fetchable.
      enabled: column.type !== "rss" || !!column.rssUrl,
    });

  useFeedHeadRefresh({
    queryKey: feedQueryKey,
    headUrl: headRefreshUrl,
    refreshIntervalMs: refreshInterval,
    enabled: autoRefresh && status === "success",
  });

  // Restore scroll position after data loads on back-navigation.
  // React Query serves cached data immediately (staleTime: 30s), so this
  // fires on the same render cycle as mount when navigating back.
  useEffect(() => {
    if (status !== "success") return;
    const saved = sessionStorage.getItem(scrollKey);
    if (!saved) return;
    sessionStorage.removeItem(scrollKey);
    const scrollTop = parseInt(saved, 10);
    if (!isNaN(scrollTop) && scrollRef.current) {
      scrollRef.current.scrollTop = scrollTop;
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status, scrollKey]);

  const observerRef = useRef<IntersectionObserver | null>(null);
  const sentinelRef = useCallback(
    (node: HTMLDivElement | null) => {
      if (observerRef.current) observerRef.current.disconnect();
      if (!node) return;
      observerRef.current = new IntersectionObserver(
        (entries) => {
          if (entries[0].isIntersecting && hasNextPage && !isFetchingNextPage) {
            fetchNextPage();
          }
        },
        { root: scrollRef.current, threshold: 0.1 }
      );
      observerRef.current.observe(node);
    },
    [hasNextPage, isFetchingNextPage, fetchNextPage]
  );

  const castItems = (() => {
    if (isNews) return [];
    const seen = new Set<string>();
    return (data?.pages.flatMap((p) => p.casts ?? []) ?? []).filter((c) => {
      if (!isRootCast(c)) return false;
      if (seen.has(c.hash)) return false;
      seen.add(c.hash);
      return true;
    });
  })();

  const newsItems = isNews
    ? (data?.pages.flatMap((p) => (p as NewsFeedPage).articles ?? []) ?? [])
    : [];

  const isFallback = !isNews && data?.pages[0]?.isFallback;

  const defaultHeader = (
    <div className="shrink-0 flex items-center justify-between gap-2 px-3 py-2 border-b border-[var(--border)] bg-[var(--background)]">
      <p className="text-sm font-semibold truncate text-[var(--muted)]">{column.title}</p>
      <RefreshButton isFetching={isFetching} onRefresh={() => void refetch()} />
    </div>
  );

  return (
    <div className="h-full min-h-0 flex flex-col">
      {renderHeader ? renderHeader(isFetching, () => void refetch()) : defaultHeader}

      {isFallback && (
        <div className="px-3 py-1.5 text-xs text-[var(--muted)] bg-[var(--surface)] border-b border-[var(--border)]">
          Your feed is warming up — showing trending casts instead.
        </div>
      )}

      <div ref={scrollRef} className="flex-1 min-h-0 overflow-y-auto feed-scroll">
        {status === "pending" && (
          <div className="flex items-center justify-center py-12 text-[var(--muted)] text-sm">
            Loading…
          </div>
        )}
        {status === "error" && (
          <div className="flex flex-col items-center justify-center py-12 gap-2 px-4 text-center">
            <span className="text-red-400 text-sm">Failed to load feed.</span>
            {error && (
              <span className="text-[var(--muted)] text-xs break-words">
                {(error as Error).message}
              </span>
            )}
          </div>
        )}

        {!isNews &&
          status === "success" &&
          castItems.map((cast: Record<string, unknown>) => (
            <CastCard
              key={cast.hash as string}
              cast={cast}
              viewerFid={viewerFid}
              onAuthorClick={handleAuthorClick}
              touchFriendly
            />
          ))}

        {isNews &&
          status === "success" &&
          newsItems.map((article: NewsArticle) => (
            <NewsArticleCard key={article.id} article={article} />
          ))}

        {status === "success" &&
          (isNews ? newsItems.length === 0 : castItems.length === 0) && (
            <div className="flex items-center justify-center py-12 text-[var(--muted)] text-sm">
              Nothing to show yet.
            </div>
          )}

        <div ref={sentinelRef} className="h-1" />
        {isFetchingNextPage && (
          <div className="text-center py-4 text-[var(--muted)] text-xs">Loading more…</div>
        )}
      </div>
    </div>
  );
}
