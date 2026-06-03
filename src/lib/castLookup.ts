import { hsnap } from "@/lib/hypersnap";
import { normalizeCast } from "@/lib/normalizeCast";
import { normalizeCastHash } from "@/lib/viewerContext";

export { normalizeCastHash };

export function isQuotedCastSeed(
  value: unknown
): value is Record<string, unknown> {
  if (!value || typeof value !== "object") return false;
  const c = value as Record<string, unknown>;
  const author = c.author as Record<string, unknown> | undefined;
  if (!author?.username && !author?.fid) return false;
  return (
    typeof c.text === "string" ||
    Array.isArray(c.embeds) ||
    typeof c.timestamp === "string"
  );
}

export async function fetchCastByHash(
  hash: string
): Promise<Record<string, unknown>> {
  const id = normalizeCastHash(hash);
  const data = await hsnap<{ cast: Record<string, unknown> }>(
    "/v2/farcaster/cast",
    { identifier: id, type: "hash" }
  );
  return normalizeCast(data.cast);
}

/** Collect quote hashes from feed casts; return seeds when Hypersnap inlined them. */
export function collectQuotedCastRefs(
  casts: Record<string, unknown>[]
): { hash: string; seed: Record<string, unknown> | null }[] {
  const out: { hash: string; seed: Record<string, unknown> | null }[] = [];
  const seen = new Set<string>();

  for (const cast of casts) {
    const embeds = (cast.embeds as Record<string, unknown>[] | undefined) ?? [];
    for (const embed of embeds) {
      if (embed.url) continue;
      const inner = embed.cast ?? embed.cast_id;
      const hash =
        typeof inner === "object" && inner !== null
          ? (inner as { hash?: string }).hash
          : typeof embed.cast_id === "string"
            ? embed.cast_id
            : null;
      if (!hash) continue;
      const normalized = normalizeCastHash(String(hash));
      if (seen.has(normalized)) continue;
      seen.add(normalized);
      const seed =
        typeof inner === "object" && inner !== null && isQuotedCastSeed(inner)
          ? (inner as Record<string, unknown>)
          : null;
      out.push({ hash: normalized, seed });
    }
  }
  return out;
}

export function quotedCastsNeedingFetch(
  refs: { hash: string; seed: Record<string, unknown> | null }[]
): string[] {
  return refs.filter((r) => !r.seed).map((r) => r.hash);
}
