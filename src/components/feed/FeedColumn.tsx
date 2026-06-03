"use client";

import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { useInfiniteQuery, useQueryClient } from "@tanstack/react-query";
import { prefetchQuotedCasts } from "@/hooks/useQuotedCast";
import { prefetchOgForCasts } from "@/hooks/useOgMetadata";
import { useColumnsStore } from "@/store/columns";
import type { FeedColumnConfig } from "@/types";
import { CastCard } from "@/components/cast/CastCard";
import { isRootCast } from "@/lib/castFilters";
import { MAX_FEED_CURSOR_BYTES } from "@/lib/feedPagination";
import { AddColumnModal } from "@/components/feed/AddColumnModal";
import { ShareColumnModal } from "@/components/feed/ShareColumnModal";
import { useRef, useCallback, useState, useEffect } from "react";

/** Column types that have configurable filters the user can edit */
const EDITABLE_TYPES = new Set(["channel", "user", "keyword"]);

interface FeedColumnProps {
  column: FeedColumnConfig;
  columnIndex: number;
  viewerFid: number;
}

function buildFeedUrl(column: FeedColumnConfig, cursor?: string): string {
  const base = (() => {
    switch (column.type) {
      case "home": return "/api/feed/home";
      case "trending": return "/api/feed/trending";
      case "channel":
        return `/api/feed/channel?channelIds=${(column.channelIds ?? []).join(",")}`;
      case "user": {
        const fids = column.targetFids ?? (column.targetFid ? [column.targetFid] : []);
        return `/api/feed/user?fids=${fids.join(",")}`;
      }
      case "keyword": {
        const qs = column.queries ?? (column.query ? [column.query] : []);
        return `/api/feed/keyword?queries=${qs.map(encodeURIComponent).join(",")}`;
      }
    }
  })();
  const params = new URLSearchParams();
  params.set("limit", "25");
  if (cursor) params.set("cursor", cursor);
  const qs = params.toString();
  return `${base}${base.includes("?") ? "&" : "?"}${qs}`;
}

export function FeedColumn({ column, columnIndex, viewerFid }: FeedColumnProps) {
  const queryClient = useQueryClient();
  const { removeColumn, updateColumn } = useColumnsStore();
  const scrollRef = useRef<HTMLDivElement>(null);
  const [editingTitle, setEditingTitle] = useState(false);
  const [titleDraft, setTitleDraft] = useState(column.title);
  const [editOpen, setEditOpen] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  const titleInputRef = useRef<HTMLInputElement>(null);

  function startEditing() {
    setTitleDraft(column.title);
    setEditingTitle(true);
    setTimeout(() => titleInputRef.current?.select(), 0);
  }

  function commitTitle() {
    const trimmed = titleDraft.trim();
    if (trimmed && trimmed !== column.title) {
      updateColumn(column.id, { title: trimmed });
    }
    setEditingTitle(false);
  }

  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: column.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  // Stagger background refresh so columns don't refetch in sync
  const refreshInterval = (column.refreshInterval ?? 60_000) + columnIndex * 5_000;

  // Stagger initial fetch on page load — avoids N columns × hundreds of API calls at once
  const [fetchEnabled, setFetchEnabled] = useState(columnIndex === 0);
  useEffect(() => {
    if (columnIndex === 0) return;
    const t = setTimeout(() => setFetchEnabled(true), columnIndex * 400);
    return () => clearTimeout(t);
  }, [columnIndex]);

  const { data, error, fetchNextPage, hasNextPage, isFetchingNextPage, status, isFetching, isLoading, refetch } =
    useInfiniteQuery({
      queryKey: ["feed", column.type, column.channelIds, column.targetFids ?? column.targetFid, column.queries ?? column.query],
      queryFn: async ({ pageParam }) => {
        let cursor = pageParam as string | undefined;
        // Drop oversized cursors (legacy full-cast blobs or too many tracked users).
        if (cursor && cursor.length > MAX_FEED_CURSOR_BYTES) cursor = undefined;

        const url = buildFeedUrl(column, cursor);
        let res: Response;
        try {
          res = await fetch(url);
        } catch (err) {
          const msg = err instanceof Error ? err.message : "Network error";
          throw new Error(msg === "Failed to fetch" ? "Feed request failed — try refresh" : msg);
        }
        const json = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(json?.error ?? `Feed fetch failed: ${res.status}`);
        return json;
      },
      initialPageParam: undefined as string | undefined,
      getNextPageParam: (lastPage, allPages) => {
        const cursor = lastPage.next?.cursor;
        if (!cursor) return undefined;
        const lastCasts = (lastPage.casts ?? []) as { hash?: string }[];
        if (lastCasts.length === 0) return undefined;
        const priorHashes = new Set(
          allPages
            .slice(0, -1)
            .flatMap((p) => ((p.casts ?? []) as { hash?: string }[]).map((c) => c.hash))
            .filter(Boolean)
        );
        const newCount = lastCasts.filter((c) => c.hash && !priorHashes.has(c.hash)).length;
        if (newCount === 0) return undefined;
        return cursor;
      },
      refetchInterval: (query) => {
        if ((query.state.data?.pages.length ?? 0) > 1) return false;
        return refreshInterval;
      },
      refetchIntervalInBackground: false,
      enabled: fetchEnabled,
      staleTime: 30_000,
    });

  // Infinite scroll sentinel
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

  // Deduplicate: cursor pagination can return the same cast on adjacent page boundaries
  const allCasts = (() => {
    const seen = new Set<string>();
    return (data?.pages.flatMap((p) => p.casts ?? []) ?? []).filter((c) => {
      if (!isRootCast(c)) return false;
      if (seen.has(c.hash)) return false;
      seen.add(c.hash);
      return true;
    });
  })();
  const isFallback = data?.pages[0]?.isFallback;

  // Defer embed prefetches until after the column paints; cap to first page only
  const prefetchDoneRef = useRef(false);
  useEffect(() => {
    prefetchDoneRef.current = false;
  }, [column.id]);

  useEffect(() => {
    if (status !== "success" || allCasts.length === 0 || prefetchDoneRef.current) return;
    prefetchDoneRef.current = true;
    const firstPage = (allCasts as Record<string, unknown>[]).slice(0, 25);
    const delay = 400 + columnIndex * 300;
    const run = () => {
      prefetchQuotedCasts(queryClient, firstPage).catch(() => {});
      prefetchOgForCasts(queryClient, firstPage).catch(() => {});
    };
    if (typeof requestIdleCallback !== "undefined") {
      const id = requestIdleCallback(run, { timeout: delay + 2000 });
      return () => cancelIdleCallback(id);
    }
    const t = setTimeout(run, delay);
    return () => clearTimeout(t);
  }, [status, allCasts.length, columnIndex, queryClient, column.id]);

  return (
    <>
    <div
      id={`column-${column.id}`}
      ref={setNodeRef}
      style={style}
      className="flex flex-col w-[310px] shrink-0 border-r border-[var(--border)] h-full scroll-mt-0"
    >
      {/* Column header */}
      <div
        suppressHydrationWarning
        className="flex items-center justify-between px-3 py-2.5 border-b border-[var(--border)] shrink-0 bg-[var(--background)] cursor-grab active:cursor-grabbing select-none"
        {...attributes}
        {...listeners}
      >
        <div className="flex items-center gap-2 flex-1 min-w-0">
          <ColumnTypeIcon type={column.type} />
          {editingTitle ? (
            <input
              ref={titleInputRef}
              value={titleDraft}
              onChange={(e) => setTitleDraft(e.target.value)}
              onBlur={commitTitle}
              onKeyDown={(e) => {
                if (e.key === "Enter") commitTitle();
                if (e.key === "Escape") setEditingTitle(false);
                e.stopPropagation(); // prevent dnd-kit from eating keystrokes
              }}
              onPointerDown={(e) => e.stopPropagation()}
              className="text-sm font-semibold text-[var(--foreground)] bg-[var(--surface-hover)] border border-[var(--accent)] rounded px-1.5 py-0.5 outline-none w-full min-w-0"
            />
          ) : (
            <button
              onPointerDown={(e) => e.stopPropagation()}
              onClick={startEditing}
              className="text-sm font-semibold text-[var(--foreground)] truncate hover:text-[var(--accent)] transition-colors text-left"
              title="Click to rename"
            >
              {column.title}
            </button>
          )}
          {(isLoading || !fetchEnabled) && !isFetchingNextPage && !editingTitle && (
            <div className="w-1.5 h-1.5 rounded-full bg-[var(--accent)] animate-pulse shrink-0" />
          )}
        </div>
        {/* Manual refresh button */}
        <button
          onPointerDown={(e) => e.stopPropagation()}
          onClick={() => refetch()}
          disabled={isLoading || isFetching}
          className="text-[var(--muted)] hover:text-[var(--foreground)] disabled:opacity-40 transition-colors p-0.5 rounded shrink-0"
          title="Refresh column"
        >
          <svg
            className={`w-3.5 h-3.5 ${isLoading || isFetching ? "animate-spin" : ""}`}
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
          </svg>
        </button>

        {/* Edit filter button (only for configurable column types) */}
        {EDITABLE_TYPES.has(column.type) && (
          <button
            onPointerDown={(e) => e.stopPropagation()}
            onClick={() => setEditOpen(true)}
            className="text-[var(--muted)] hover:text-[var(--foreground)] transition-colors p-0.5 rounded shrink-0"
            title="Edit column filters"
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
            </svg>
          </button>
        )}
        <button
          onPointerDown={(e) => e.stopPropagation()}
          onClick={() => setShareOpen(true)}
          className="text-[var(--muted)] hover:text-[var(--foreground)] transition-colors p-0.5 rounded shrink-0"
          title="Share or export this column"
        >
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z"
            />
          </svg>
        </button>
        {confirmDelete ? (
          <span className="flex items-center gap-1 shrink-0" onPointerDown={(e) => e.stopPropagation()}>
            <span className="text-[10px] text-[var(--muted)] whitespace-nowrap">Remove?</span>
            <button
              onClick={() => removeColumn(column.id)}
              className="text-[10px] font-semibold text-red-400 hover:text-red-300 transition-colors px-1 py-0.5 rounded"
            >
              Yes
            </button>
            <button
              onClick={() => setConfirmDelete(false)}
              className="text-[10px] text-[var(--muted)] hover:text-[var(--foreground)] transition-colors px-1 py-0.5 rounded"
            >
              No
            </button>
          </span>
        ) : (
          <button
            onPointerDown={(e) => e.stopPropagation()}
            onClick={() => setConfirmDelete(true)}
            className="text-[var(--muted)] hover:text-[var(--foreground)] transition-colors p-0.5 rounded shrink-0"
            title="Remove column"
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        )}
      </div>

      {/* Feed fallback banner */}
      {isFallback && (
        <div className="px-3 py-1.5 text-xs text-[var(--muted)] bg-[var(--surface)] border-b border-[var(--border)]">
          Your feed is warming up — showing trending casts instead.
        </div>
      )}

      {/* Cast list */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto feed-scroll">
        {(status === "pending" || !fetchEnabled) && (
          <div className="flex items-center justify-center py-12 text-[var(--muted)] text-sm">
            Loading…
          </div>
        )}
        {status === "error" && allCasts.length === 0 && (
          <div className="flex flex-col items-center justify-center py-12 gap-2 px-4 text-center">
            <span className="text-red-400 text-sm">Failed to load feed.</span>
            {error && (
              <span className="text-[var(--muted)] text-xs break-words">
                {(error as Error).message}
              </span>
            )}
            <button
              type="button"
              onClick={() => {
                queryClient.resetQueries({
                  queryKey: ["feed", column.type, column.channelIds, column.targetFids ?? column.targetFid, column.queries ?? column.query],
                });
              }}
              className="text-xs text-[var(--accent)] hover:underline mt-1"
            >
              Reset column
            </button>
          </div>
        )}
        {status === "error" && allCasts.length > 0 && (
          <div className="px-3 py-2 text-xs text-center text-red-400/90 bg-red-500/10 border-b border-[var(--border)]">
            Couldn&apos;t refresh — showing cached casts.{" "}
            <button
              type="button"
              onClick={() => refetch()}
              className="text-[var(--accent)] hover:underline"
            >
              Retry
            </button>
          </div>
        )}
        {status === "success" && allCasts.length === 0 && (
          <div className="flex items-center justify-center py-12 text-[var(--muted)] text-sm">
            Nothing to show yet.
          </div>
        )}
        {allCasts.map((cast: Record<string, unknown>) => (
          <CastCard
            key={cast.hash as string}
            cast={cast}
            viewerFid={viewerFid}
          />
        ))}
        {/* Infinite scroll sentinel */}
        <div ref={sentinelRef} className="h-1" />
        {isFetchingNextPage && (
          <div className="text-center py-4 text-[var(--muted)] text-xs">Loading more…</div>
        )}
        {status === "success" && !hasNextPage && allCasts.length > 0 && (
          <div className="text-center py-4 px-3 text-[var(--muted)] text-xs border-t border-[var(--border)]">
            End of feed. Only top-level posts are shown — replies are hidden, so quiet days may look like gaps.
          </div>
        )}
      </div>
    </div>

    {/* Edit column modal */}
    {editOpen && (
      <AddColumnModal
        onClose={() => setEditOpen(false)}
        editColumn={column}
      />
    )}
    {shareOpen && (
      <ShareColumnModal column={column} onClose={() => setShareOpen(false)} />
    )}
    </>
  );
}

function ColumnTypeIcon({ type }: { type: FeedColumnConfig["type"] }) {
  const icons: Record<FeedColumnConfig["type"], React.ReactNode> = {
    home: (
      <svg className="w-3.5 h-3.5 text-[var(--muted)]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
      </svg>
    ),
    channel: (
      <svg className="w-3.5 h-3.5 text-[var(--muted)]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 20l4-16m2 16l4-16M6 9h14M4 15h14" />
      </svg>
    ),
    user: (
      <svg className="w-3.5 h-3.5 text-[var(--muted)]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
      </svg>
    ),
    keyword: (
      <svg className="w-3.5 h-3.5 text-[var(--muted)]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
      </svg>
    ),
    trending: (
      <svg className="w-3.5 h-3.5 text-[var(--muted)]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
      </svg>
    ),
  };
  return <>{icons[type]}</>;
}
