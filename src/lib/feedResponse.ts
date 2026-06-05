import { normalizeCast } from "@/lib/normalizeCast";
import {
  annotateFeedCasts,
  annotateViewerContext,
  getFeedViewerContext,
  hydrateFeedReactions,
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
