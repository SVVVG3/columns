"use client";

import { useQuery, type QueryClient } from "@tanstack/react-query";
import { normalizeCast } from "@/lib/normalizeCast";
import {
  normalizeCastHash,
  isQuotedCastSeed,
  collectQuotedCastRefs,
  quotedCastsNeedingFetch,
} from "@/lib/castLookup";

const STALE_MS = 5 * 60_000;

async function fetchCast(hash: string): Promise<Record<string, unknown>> {
  const res = await fetch(`/api/cast/${encodeURIComponent(hash)}`);
  if (!res.ok) throw new Error("Cast fetch failed");
  return res.json();
}

export function useQuotedCast(
  hash: string,
  seed?: Record<string, unknown> | null
) {
  const id = normalizeCastHash(hash);
  const seedData =
    seed && isQuotedCastSeed(seed)
      ? normalizeCast(seed as Record<string, unknown>)
      : undefined;

  return useQuery({
    queryKey: ["cast", id],
    queryFn: () => fetchCast(id),
    initialData: seedData,
    staleTime: STALE_MS,
    enabled: !!id,
  });
}

/** Prefetch quoted casts for a feed page in one bulk request. */
export async function prefetchQuotedCasts(
  queryClient: QueryClient,
  casts: Record<string, unknown>[]
) {
  const refs = collectQuotedCastRefs(casts);
  const hashes = quotedCastsNeedingFetch(refs);

  for (const { hash, seed } of refs) {
    if (seed && isQuotedCastSeed(seed)) {
      const id = normalizeCastHash(hash);
      queryClient.setQueryData(
        ["cast", id],
        normalizeCast(seed as Record<string, unknown>)
      );
    }
  }

  if (hashes.length === 0) return;

  const bulkKey = ["cast-bulk", hashes.slice().sort().join(",")] as const;
  await queryClient.fetchQuery({
    queryKey: bulkKey,
    staleTime: STALE_MS,
    queryFn: async () => {
      const res = await fetch(
        `/api/cast/bulk?hashes=${encodeURIComponent(hashes.join(","))}`
      );
      if (!res.ok) throw new Error("Bulk cast fetch failed");
      const data = (await res.json()) as {
        casts?: Record<string, Record<string, unknown>>;
      };
      for (const [h, cast] of Object.entries(data.casts ?? {})) {
        queryClient.setQueryData(["cast", normalizeCastHash(h)], cast);
      }
      return data.casts ?? {};
    },
  });
}
