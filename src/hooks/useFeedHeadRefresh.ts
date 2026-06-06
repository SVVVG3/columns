import { useEffect } from "react";
import {
  useQueryClient,
  type InfiniteData,
  type QueryKey,
} from "@tanstack/react-query";

interface FeedHeadPage {
  casts?: { hash?: string }[];
  next?: { cursor?: string } | null;
}

/**
 * Polls the first feed page on an interval and updates page 0 in the infinite query.
 * Keeps older scrolled pages intact — unlike disabling refetchInterval after page 2+.
 */
export function useFeedHeadRefresh(options: {
  queryKey: QueryKey;
  headUrl: string;
  refreshIntervalMs: number;
  enabled: boolean;
}) {
  const { queryKey, headUrl, refreshIntervalMs, enabled } = options;
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!enabled) return;

    const tick = async () => {
      if (document.hidden) return;
      try {
        const res = await fetch(headUrl, { cache: "no-store" });
        if (!res.ok) return;
        const json = (await res.json()) as FeedHeadPage;
        const incoming = json.casts ?? [];
        if (incoming.length === 0) return;

        queryClient.setQueryData<InfiniteData<FeedHeadPage>>(queryKey, (old) => {
          if (!old?.pages?.length) return old;
          return {
            ...old,
            pages: [
              {
                ...old.pages[0],
                casts: incoming,
                next: json.next ?? old.pages[0].next,
              },
              ...old.pages.slice(1),
            ],
          };
        });
      } catch {
        // background refresh — ignore transient errors
      }
    };

    const id = window.setInterval(tick, refreshIntervalMs);
    return () => window.clearInterval(id);
  }, [queryKey, headUrl, refreshIntervalMs, enabled, queryClient]);
}
