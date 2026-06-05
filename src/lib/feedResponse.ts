import { normalizeCast } from "@/lib/normalizeCast";
import {
  annotateFeedCasts,
  annotateReplyCounts,
  annotateViewerContext,
  getFeedViewerContext,
  hydrateFeedReactions,
  hydrateReplyCounts,
} from "@/lib/viewerContext";

/** Attach viewer liked/recasted state and accurate reaction counts to a feed page. */
export async function buildFeedCastsResponse(
  casts: Record<string, unknown>[],
  viewerFid: number
): Promise<Record<string, unknown>[]> {
  const normalized = casts.map(normalizeCast);
  const [baseVc, hydration] = await Promise.all([
    getFeedViewerContext(viewerFid),
    hydrateFeedReactions(normalized, viewerFid),
  ]);
  return annotateFeedCasts(normalized, hydration, baseVc);
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
 * Profile top casts (small N) — hydrate like/recast via reaction/cast and reply
 * counts via conversation. Popular feed payloads often have stale reaction fields.
 */
export async function buildProfilePopularCastsResponse(
  casts: Record<string, unknown>[],
  viewerFid: number
): Promise<Record<string, unknown>[]> {
  const normalized = casts.map(normalizeCast);
  const [baseVc, hydration, replyCounts] = await Promise.all([
    getFeedViewerContext(viewerFid),
    hydrateFeedReactions(normalized, viewerFid),
    hydrateReplyCounts(normalized),
  ]);
  return annotateReplyCounts(
    annotateFeedCasts(normalized, hydration, baseVc),
    replyCounts
  );
}
