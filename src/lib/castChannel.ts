import { channelSlugFromUrl, normalizeChannelId } from "@/lib/channelDisplay";

/** Channel a cast was posted to (from root_parent_url / parent_url), if any. */
export function channelSlugFromCast(cast: Record<string, unknown>): string | null {
  const channel = cast.channel;
  if (channel && typeof channel === "object") {
    const o = channel as Record<string, unknown>;
    const id =
      (typeof o.id === "string" && o.id) ||
      (typeof o.channel_id === "string" && o.channel_id) ||
      (typeof o.slug === "string" && o.slug);
    if (id) {
      const slug = normalizeChannelId(id);
      if (slug) return slug;
    }
  }

  if (typeof cast.channel_id === "string") {
    const slug = normalizeChannelId(cast.channel_id);
    if (slug) return slug;
  }

  for (const field of ["root_parent_url", "parent_url"] as const) {
    const url = cast[field];
    if (typeof url !== "string" || !url.includes("/channel/")) continue;
    const slug = channelSlugFromUrl(url);
    if (slug) return slug;
  }

  return null;
}
