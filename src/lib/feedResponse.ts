import { normalizeCast } from "@/lib/normalizeCast";
import {
  annotateFeedCasts,
  getViewerContext,
  hydrateFeedReactions,
} from "@/lib/viewerContext";

/** Attach viewer liked/recasted state and accurate reaction counts to a feed page. */
export async function buildFeedCastsResponse(
  casts: Record<string, unknown>[],
  viewerFid: number
): Promise<Record<string, unknown>[]> {
  const normalized = casts.map(normalizeCast);
  const [baseVc, hydration] = await Promise.all([
    getViewerContext(viewerFid),
    hydrateFeedReactions(normalized, viewerFid),
  ]);
  return annotateFeedCasts(normalized, hydration, baseVc);
}
