"use client";

import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { useInfiniteQuery, useQueryClient } from "@tanstack/react-query";
import { useColumnsStore } from "@/store/columns";
import type { FeedColumnConfig } from "@/types";
import type { NewsArticle, NewsFeedPage } from "@/lib/newsArticle";
import { NewsArticleCard } from "@/components/news/NewsArticleCard";
import { AddColumnModal } from "@/components/feed/AddColumnModal";
import { ShareColumnModal } from "@/components/feed/ShareColumnModal";
import { useRef, useCallback, useState, useEffect } from "react";

interface NewsFeedColumnProps {
  column: FeedColumnConfig;
  columnIndex: number;
}

function buildNewsFeedUrl(column: FeedColumnConfig, cursor?: string): string {
  const params = new URLSearchParams({ limit: "20" });
  if (cursor) params.set("cursor", cursor);

  if (column.type === "rss") {
    if (!column.rssUrl) throw new Error("RSS column is missing a feed URL");
    params.set("url", column.rssUrl);
    return `/api/feed/rss?${params}`;
  }

  return `/api/feed/coindesk?${params}`;
}

function columnIcon(type: FeedColumnConfig["type"]) {
  const iconClass = "w-5 h-5 text-[var(--muted)] shrink-0";
  if (type === "rss") {
    return (
      <svg className={iconClass} fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={2}
          d="M6 5c7.18 0 13 5.82 13 13M6 11a7 7 0 017 7m-6 0a1 1 0 11-2 0 1 1 0 012 0z"
        />
      </svg>
    );
  }
  return (
    <svg className={iconClass} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M19 20H5a2 2 0 01-2-2V6a2 2 0 012-2h10a2 2 0 012 2v1m2 13a2 2 0 01-2-2V7m2 13a2 2 0 002-2V9a2 2 0 00-2-2h-2m-4-3H9M7 16h6M7 8h6v4H7V8z"
      />
    </svg>
  );
}

export function NewsFeedColumn({ column, columnIndex }: NewsFeedColumnProps) {
  const queryClient = useQueryClient();
  const { removeColumn, updateColumn } = useColumnsStore();
  const scrollRef = useRef<HTMLDivElement>(null);
  const [editingTitle, setEditingTitle] = useState(false);
  const [titleDraft, setTitleDraft] = useState(column.title);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const titleInputRef = useRef<HTMLInputElement>(null);

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

  const refreshInterval = (column.refreshInterval ?? 60_000) + columnIndex * 1_000;

  const [fetchEnabled, setFetchEnabled] = useState(columnIndex === 0);
  useEffect(() => {
    if (columnIndex === 0) return;
    const t = setTimeout(() => setFetchEnabled(true), columnIndex * 400);
    return () => clearTimeout(t);
  }, [columnIndex]);

  const feedQueryKey = ["feed", column.type, column.id, column.rssUrl ?? ""] as const;

  const { data, error, fetchNextPage, hasNextPage, isFetchingNextPage, status, isFetching, isLoading, refetch } =
    useInfiniteQuery({
      queryKey: feedQueryKey,
      queryFn: async ({ pageParam }) => {
        const url = buildNewsFeedUrl(column, pageParam as string | undefined);
        const res = await fetch(url);
        const json = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(json?.error ?? `News fetch failed: ${res.status}`);
        return json as NewsFeedPage;
      },
      initialPageParam: undefined as string | undefined,
      getNextPageParam: (lastPage) => lastPage.next?.cursor ?? undefined,
      refetchInterval: refreshInterval,
      refetchIntervalInBackground: false,
      enabled: fetchEnabled && (column.type !== "rss" || !!column.rssUrl),
      staleTime: 60_000,
    });

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

  const articles = (() => {
    const seen = new Set<string>();
    return (data?.pages.flatMap((p) => p.articles ?? []) ?? []).filter((a) => {
      const key = String(a.id);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  })();

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

  const endLabel =
    column.type === "rss"
      ? "End of feed · Articles open at source"
      : "End of feed · Articles open on publisher sites";

  return (
    <>
      <div
        id={`column-${column.id}`}
        ref={setNodeRef}
        style={style}
        className="flex flex-col w-[340px] shrink-0 border-r border-[var(--border)] h-full scroll-mt-0"
      >
        <div
          suppressHydrationWarning
          className="flex items-center justify-between gap-2 h-12 px-3 border-b border-[var(--border)] shrink-0 bg-[var(--background)] cursor-grab active:cursor-grabbing select-none"
          {...attributes}
          {...listeners}
        >
          <div className="flex items-center gap-2.5 flex-1 min-w-0">
            {columnIcon(column.type)}
            {editingTitle ? (
              <input
                ref={titleInputRef}
                value={titleDraft}
                onChange={(e) => setTitleDraft(e.target.value)}
                onBlur={commitTitle}
                onKeyDown={(e) => {
                  if (e.key === "Enter") commitTitle();
                  if (e.key === "Escape") setEditingTitle(false);
                  e.stopPropagation();
                }}
                onPointerDown={(e) => e.stopPropagation()}
                className="text-sm font-semibold text-[var(--foreground)] bg-[var(--surface-hover)] border border-[var(--accent)] rounded px-2 py-1 outline-none w-full min-w-0"
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
              <div className="w-2 h-2 rounded-full bg-[var(--accent)] animate-pulse shrink-0" />
            )}
          </div>
          <div className="flex items-center gap-0.5 shrink-0">
            <button
              onPointerDown={(e) => e.stopPropagation()}
              onClick={() => refetch()}
              disabled={isLoading || isFetching}
              className="text-[var(--muted)] hover:text-[var(--foreground)] disabled:opacity-40 transition-colors p-1.5 rounded-lg shrink-0"
              title="Refresh column"
            >
              <svg
                className={`w-4 h-4 ${isLoading || isFetching ? "animate-spin" : ""}`}
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
            </button>
            {column.type === "rss" && (
              <button
                onPointerDown={(e) => e.stopPropagation()}
                onClick={() => setEditOpen(true)}
                className="text-[var(--muted)] hover:text-[var(--foreground)] transition-colors p-1.5 rounded-lg shrink-0"
                title="Edit feed URL"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={1.5}
                    d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"
                  />
                </svg>
              </button>
            )}
            <button
              onPointerDown={(e) => e.stopPropagation()}
              onClick={() => setShareOpen(true)}
              className="text-[var(--muted)] hover:text-[var(--foreground)] transition-colors p-1.5 rounded-lg shrink-0"
              title="Share or export this column"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
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
                <span className="text-xs text-[var(--muted)] whitespace-nowrap">Remove?</span>
                <button
                  onClick={() => removeColumn(column.id)}
                  className="text-xs font-semibold text-red-400 hover:text-red-300 transition-colors px-1.5 py-1 rounded"
                >
                  Yes
                </button>
                <button
                  onClick={() => setConfirmDelete(false)}
                  className="text-xs text-[var(--muted)] hover:text-[var(--foreground)] transition-colors px-1.5 py-1 rounded"
                >
                  No
                </button>
              </span>
            ) : (
              <button
                onPointerDown={(e) => e.stopPropagation()}
                onClick={() => setConfirmDelete(true)}
                className="text-[var(--muted)] hover:text-[var(--foreground)] transition-colors p-1.5 rounded-lg shrink-0"
                title="Remove column"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            )}
          </div>
        </div>

        <div ref={scrollRef} className="flex-1 overflow-y-auto feed-scroll">
          {(status === "pending" || !fetchEnabled) && (
            <div className="flex items-center justify-center py-12 text-[var(--muted)] text-sm">
              Loading…
            </div>
          )}
          {status === "error" && articles.length === 0 && (
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
                  queryClient.resetQueries({ queryKey: [...feedQueryKey] });
                }}
                className="text-xs text-[var(--accent)] hover:underline mt-1"
              >
                Reset column
              </button>
            </div>
          )}
          {status === "success" && articles.length === 0 && (
            <div className="flex items-center justify-center py-12 text-[var(--muted)] text-sm">
              No articles right now.
            </div>
          )}
          {articles.map((article: NewsArticle) => (
            <NewsArticleCard key={String(article.id)} article={article} />
          ))}
          <div ref={sentinelRef} className="h-1" />
          {isFetchingNextPage && (
            <div className="text-center py-4 text-[var(--muted)] text-xs">Loading more…</div>
          )}
          {status === "success" && !hasNextPage && articles.length > 0 && (
            <div className="text-center py-4 px-3 text-[var(--muted)] text-xs border-t border-[var(--border)]">
              {endLabel}
            </div>
          )}
        </div>
      </div>

      {editOpen && (
        <AddColumnModal onClose={() => setEditOpen(false)} editColumn={column} />
      )}
      {shareOpen && <ShareColumnModal column={column} onClose={() => setShareOpen(false)} />}
    </>
  );
}
