import { fetchCastByHash } from "@/lib/castLookup";
import { normalizeCastHash } from "@/lib/viewerContext";

export interface ThreadRootResolution {
  /** Hash of the top-level cast in the thread (no parent). */
  rootHash: string;
  /** Hash the user clicked or navigated to. */
  focusHash: string;
}

/** Walk parent_hash links until the thread root; used before conversation fetch. */
export async function resolveThreadRootHash(
  hash: string
): Promise<ThreadRootResolution> {
  const focusHash = normalizeCastHash(hash);
  let current = focusHash;
  const visited = new Set<string>();

  while (!visited.has(current)) {
    visited.add(current);
    const cast = await fetchCastByHash(current);
    if (!cast) {
      return { rootHash: focusHash, focusHash };
    }

    const parent = cast.parent_hash;
    if (typeof parent !== "string" || parent.length === 0) {
      return { rootHash: current, focusHash };
    }

    current = normalizeCastHash(parent);
  }

  return { rootHash: current, focusHash };
}
