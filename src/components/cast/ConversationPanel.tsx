"use client";

import { useEffect, useRef } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { prefetchOgForCasts } from "@/hooks/useOgMetadata";
import { useUiStore } from "@/store/ui";
import { CastCard } from "@/components/cast/CastCard";

interface ConversationPanelProps {
  viewerFid: number;
}

// Recursively flatten a conversation cast tree into a list (DFS order)
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function flattenReplies(cast: any): any[] {
  const replies = cast.direct_replies ?? [];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const result: any[] = [];
  for (const reply of replies) {
    result.push(reply);
    result.push(...flattenReplies(reply));
  }
  return result;
}

/** Centered thread modal with blurred app backdrop. */
export function ConversationPanel({ viewerFid }: ConversationPanelProps) {
  const queryClient = useQueryClient();
  const { selectedCastHash, conversationHistory, closeConversation, goBack } =
    useUiStore();
  const isOpen = !!selectedCastHash;
  const canGoBack = conversationHistory.length > 1;
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = 0;
  }, [selectedCastHash]);

  useEffect(() => {
    if (!isOpen) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      if (canGoBack) goBack();
      else closeConversation();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [isOpen, canGoBack, goBack, closeConversation]);

  const { data, isLoading, isError } = useQuery({
    queryKey: ["conversation", selectedCastHash],
    queryFn: async () => {
      const res = await fetch(
        `/api/cast/${encodeURIComponent(selectedCastHash!)}/conversation`
      );
      if (!res.ok) throw new Error("Failed to load conversation");
      return res.json();
    },
    enabled: !!selectedCastHash,
    staleTime: 0,
  });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const rootCast: any = data?.cast ?? null;
  const replies: any[] = rootCast ? flattenReplies(rootCast) : [];
  const replyCount: number = rootCast?.replies?.count ?? 0;

  useEffect(() => {
    if (!data?.cast) return;
    const root = data.cast as Record<string, unknown>;
    prefetchOgForCasts(queryClient, [root, ...flattenReplies(root)]).catch(() => {});
  }, [data, queryClient]);

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-[85] flex items-start justify-center pt-[8vh] px-4 bg-black/55 backdrop-blur-md"
      role="presentation"
      onClick={closeConversation}
    >
      <div
        className="w-full max-w-lg bg-[var(--surface)] border border-[var(--border)] rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[min(82vh,680px)]"
        role="dialog"
        aria-label="Thread"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between gap-3 px-4 py-3.5 border-b border-[var(--border)] shrink-0">
          <div className="flex items-center gap-2 min-w-0">
            {canGoBack ? (
              <button
                type="button"
                onClick={goBack}
                className="text-[var(--muted)] hover:text-[var(--foreground)] transition-colors p-1.5 rounded-lg shrink-0"
                title="Back in thread"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M15 19l-7-7 7-7"
                  />
                </svg>
              </button>
            ) : (
              <button
                type="button"
                onClick={closeConversation}
                className="text-[var(--muted)] hover:text-[var(--foreground)] transition-colors p-1.5 rounded-lg shrink-0"
                aria-label="Close"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M6 18L18 6M6 6l12 12"
                  />
                </svg>
              </button>
            )}
            <span className="text-base font-semibold text-[var(--foreground)] truncate">
              Thread
            </span>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {replyCount > 0 && (
              <span className="text-xs text-[var(--muted)]">
                {replyCount} {replyCount === 1 ? "reply" : "replies"}
              </span>
            )}
            <kbd className="hidden sm:inline text-[10px] text-[var(--muted)] border border-[var(--border)] rounded px-1.5 py-0.5 font-mono">
              esc
            </kbd>
          </div>
        </div>

        <div ref={scrollRef} className="flex-1 overflow-y-auto feed-scroll min-h-0">
          {isLoading && (
            <div className="flex flex-col gap-3 p-4">
              {[...Array(4)].map((_, i) => (
                <div key={i} className="flex gap-2.5 animate-pulse">
                  <div className="w-9 h-9 rounded-full bg-[var(--surface-hover)] shrink-0" />
                  <div className="flex-1 space-y-2 pt-1">
                    <div className="h-2.5 w-24 rounded bg-[var(--surface-hover)]" />
                    <div className="h-2 w-full rounded bg-[var(--surface-hover)]" />
                    <div className="h-2 w-2/3 rounded bg-[var(--surface-hover)]" />
                  </div>
                </div>
              ))}
            </div>
          )}

          {isError && (
            <div className="flex items-center justify-center py-12 text-red-400 text-sm px-4 text-center">
              Failed to load thread.
            </div>
          )}

          {rootCast && !isLoading && (
            <>
              <div className="border-b-2 border-[var(--border)]">
                <CastCard
                  cast={rootCast}
                  viewerFid={viewerFid}
                  threadRootHash={selectedCastHash ?? undefined}
                />
              </div>

              {replies.length === 0 ? (
                <div className="flex items-center justify-center py-12 text-[var(--muted)] text-sm">
                  No replies yet.
                </div>
              ) : (
                <div>
                  {replies.map((cast) => (
                    <CastCard
                      key={cast.hash}
                      cast={cast}
                      viewerFid={viewerFid}
                      threadRootHash={selectedCastHash ?? undefined}
                    />
                  ))}
                </div>
              )}

              <div className="p-4 border-t border-[var(--border)] shrink-0">
                <a
                  href={`https://farcaster.xyz/~/conversations/${rootCast.hash?.startsWith("0x") ? rootCast.hash : `0x${rootCast.hash}`}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center justify-center gap-1.5 w-full py-2 rounded-xl border border-[var(--border)] text-xs text-[var(--muted)] hover:text-[var(--foreground)] hover:border-[var(--muted)] transition-colors"
                >
                  <svg
                    className="w-3.5 h-3.5"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"
                    />
                  </svg>
                  Open full thread in Farcaster
                </a>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
