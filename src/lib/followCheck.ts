import { hsnap, isHypersnapError } from "@/lib/hypersnap";

/** True if `followerFid` has an active follow link to `targetFid`. */
export async function checkUserFollows(
  followerFid: number,
  targetFid: number
): Promise<boolean> {
  if (followerFid === targetFid) return false;

  try {
    await hsnap<{ data?: unknown }>("/v1/linkById", {
      fid: followerFid,
      target_fid: targetFid,
      link_type: "follow",
    });
    return true;
  } catch (err: unknown) {
    if (isHypersnapError(err) && (err.status === 404 || err.status === 400)) {
      return false;
    }
    throw err;
  }
}

export interface FollowRelationship {
  viewerFollowsUser: boolean;
  userFollowsViewer: boolean;
}

export async function getFollowRelationship(
  viewerFid: number,
  targetFid: number
): Promise<FollowRelationship> {
  if (viewerFid === targetFid) {
    return { viewerFollowsUser: false, userFollowsViewer: false };
  }

  const [viewerFollowsUser, userFollowsViewer] = await Promise.all([
    checkUserFollows(viewerFid, targetFid),
    checkUserFollows(targetFid, viewerFid),
  ]);

  return { viewerFollowsUser, userFollowsViewer };
}
