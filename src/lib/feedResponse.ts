import { normalizeCast } from "@/lib/normalizeCast";
import {
  annotateReplyCounts,
  annotateViewerContext,
  getFeedViewerContext,
  hydrateReplyCounts,
} from "@/lib/viewerContext";

/** Attach viewer liked/recasted state. Counts stay on the cast payload. */
export async function buildFeedCastsResponse(
  casts: Record<string, unknown>[],
  viewerFid: number
): Promise<Record<string, unknown>[]> {
  const normalized = casts.map(normalizeCast);
  const vc = await getFeedViewerContext(viewerFid);
  return annotateViewerContext(normalized, vc);
}

/** Lighter feed annotation for profile previews — batch liked state only, no per-cast reaction/cast. */
export async function buildFeedCastsResponseLight(
  casts: Record<string, unknown>[],
  viewerFid: number
): Promise<Record<string, unknown>[]> {
  const normalized = casts.map(normalizeCast);
  const vc = await getFeedViewerContext(viewerFid);
  return annotateViewerContext(normalized, vc);
}

/**
 * Profile top casts. Liked state comes from batch cast-interactions.
 * Reply counts are filled in only when the payload count is missing or zero.
 */
export async function buildProfilePopularCastsResponse(
  casts: Record<string, unknown>[],
  viewerFid: number
): Promise<Record<string, unknown>[]> {
  const normalized = casts.map(normalizeCast);
  const [vc, replyCounts] = await Promise.all([
    getFeedViewerContext(viewerFid),
    hydrateReplyCounts(normalized),
  ]);
  return annotateReplyCounts(annotateViewerContext(normalized, vc), replyCounts);
}
