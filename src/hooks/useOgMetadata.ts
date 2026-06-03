"use client";

import { useQuery, type QueryClient } from "@tanstack/react-query";
import {
  collectOgUrlsFromCasts,
  ogSeedFromEmbed,
  type OGData,
} from "@/lib/ogLookup";

const STALE_MS = 60 * 60_000;

async function fetchOg(url: string): Promise<OGData> {
  const res = await fetch(`/api/og?url=${encodeURIComponent(url)}`);
  if (!res.ok) return {};
  return res.json() as Promise<OGData>;
}

export function useOgMetadata(url: string, seed?: OGData) {
  return useQuery({
    queryKey: ["og", url],
    queryFn: () => fetchOg(url),
    initialData: seed,
    placeholderData: seed,
    staleTime: STALE_MS,
    gcTime: STALE_MS * 2,
  });
}

/** One bulk request for all link previews visible in a feed column page. */
export async function prefetchOgForCasts(
  queryClient: QueryClient,
  casts: Record<string, unknown>[]
) {
  const urls = collectOgUrlsFromCasts(casts);
  if (urls.length === 0) return;

  for (const cast of casts) {
    const embeds = (cast.embeds as Array<{ url?: string; metadata?: unknown }>) ?? [];
    for (const e of embeds) {
      if (!e.url) continue;
      const seed = ogSeedFromEmbed(e);
      if (seed) {
        queryClient.setQueryData(["og", e.url], (prev: OGData | undefined) =>
          prev ? { ...seed, ...prev } : seed
        );
      }
    }
  }

  const bulkKey = ["og-bulk", urls.slice().sort().join("|")] as const;
  await queryClient.fetchQuery({
    queryKey: bulkKey,
    staleTime: STALE_MS,
    queryFn: async () => {
      const res = await fetch(
        `/api/og/bulk?urls=${encodeURIComponent(urls.join(","))}`
      );
      if (!res.ok) throw new Error("Bulk OG fetch failed");
      const data = (await res.json()) as { ogs?: Record<string, OGData> };
      for (const [url, og] of Object.entries(data.ogs ?? {})) {
        queryClient.setQueryData(
          ["og", url],
          (prev: OGData | undefined) => ({ ...prev, ...og })
        );
      }
      return data.ogs ?? {};
    },
  });
}
