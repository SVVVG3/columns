"use client";

import { useQuery } from "@tanstack/react-query";
import type { SnapPreview } from "@/lib/snapEmbed";
import { normalizeSnapUrl } from "@/lib/snapEmbed";

const STALE_MS = 60 * 60_000;

async function fetchSnapPreview(url: string): Promise<SnapPreview> {
  const res = await fetch(`/api/snap?url=${encodeURIComponent(url)}`);
  if (!res.ok) return { buttons: [] };
  return res.json() as Promise<SnapPreview>;
}

export function useSnapPreview(url: string) {
  const normalized = normalizeSnapUrl(url);
  return useQuery({
    queryKey: ["snap", normalized],
    queryFn: () => fetchSnapPreview(normalized),
    staleTime: STALE_MS,
    gcTime: STALE_MS * 2,
  });
}
