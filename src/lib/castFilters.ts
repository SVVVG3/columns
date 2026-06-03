/** True when the cast is a top-level post (not a reply to another cast). */
export function isRootCast(cast: Record<string, unknown>): boolean {
  if (cast.parent_hash) return false;
  if (cast.type === "cast-reply") return false;
  if (cast.parent) return false;
  return true;
}

export function filterRootCasts(
  casts: Record<string, unknown>[]
): Record<string, unknown>[] {
  return casts.filter(isRootCast);
}
