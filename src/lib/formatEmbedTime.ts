/** Relative time for recent embeds; short date for older ones (matches notifications). */
export function formatEmbedTime(timestamp: string | number | undefined): string {
  if (timestamp == null || timestamp === "") return "";

  const ms =
    typeof timestamp === "number"
      ? timestamp < 1e12
        ? timestamp * 1000
        : timestamp
      : new Date(timestamp).getTime();

  if (Number.isNaN(ms)) return "";

  const diff = Date.now() - ms;
  if (diff < 0) return "now";
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return "now";
  if (mins < 60) return `${mins}m`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `${days}d`;

  const date = new Date(ms);
  const opts: Intl.DateTimeFormatOptions = { month: "short", day: "numeric" };
  if (date.getFullYear() !== new Date().getFullYear()) {
    opts.year = "numeric";
  }
  return date.toLocaleDateString(undefined, opts);
}
