import { hsnap } from "@/lib/hypersnap";
import { normalizeCast } from "@/lib/normalizeCast";

export type NotificationType =
  | "likes"
  | "follows"
  | "reply"
  | "recasts"
  | "mention"
  | "cast-reply"
  | "cast-mention"
  | "reaction"
  | "follow"
  | string;

export interface HypersnapNotification {
  object?: string;
  type: NotificationType;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  cast?: Record<string, any> | null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  user?: Record<string, any>;
  timestamp?: string;
  most_recent_timestamp?: number;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  reactions?: Record<string, any>[];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  follows?: Record<string, any>[];
}

export interface NotificationsPage {
  notifications: HypersnapNotification[];
  next?: { cursor?: string } | null;
}

export async function fetchNotificationsPage(
  fid: number,
  opts?: { cursor?: string; limit?: number }
): Promise<NotificationsPage> {
  const data = await hsnap<NotificationsPage>("/v2/farcaster/notifications", {
    fid,
    limit: opts?.limit ?? 20,
    cursor: opts?.cursor,
  });

  const normalized = (data.notifications ?? []).map((n) => ({
    ...n,
    cast: n.cast ? normalizeCast(n.cast) : null,
  }));

  return {
    ...data,
    notifications: normalized,
  };
}

export type NotificationActor = Record<string, any>;

/** One row in the notifications list, after likes and recasts are grouped by cast. */
export interface NotificationFeedRow {
  key: string;
  kind: "reply" | "quote" | "mention" | "follow" | "likes" | "recasts" | "reaction" | "other";
  timestampMs: number;
  actors: NotificationActor[];
  cast: Record<string, any> | null;
  castHash: string | null;
  /**
   * Hypersnap `reaction` rows do not say like vs recast.
   * The list keeps one row until a single cast lookup splits the people.
   */
  pendingSplit: boolean;
}

/** Identity for one server row. Does not merge separate notifications together. */
export function notificationRowKey(n: HypersnapNotification): string {
  const hash = typeof n.cast?.hash === "string" ? n.cast.hash : "";
  const ts = notificationTimestampMs(n);
  if (n.type === "follow" || n.type === "follows") {
    const fid = notificationActor(n)?.fid ?? "";
    return `${n.type}:${fid}:${ts}`;
  }
  return `${n.type}:${hash}:${ts}`;
}

/** Drop a repeated server row. Does not combine people from different rows. */
export function dedupeNotifications(
  notifications: HypersnapNotification[]
): HypersnapNotification[] {
  const seen = new Set<string>();
  const out: HypersnapNotification[] = [];
  for (const n of notifications) {
    const key = notificationRowKey(n);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(n);
  }
  return out;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function actorRecord(value: unknown): Record<string, any> | null {
  if (!value || typeof value !== "object") return null;
  const row = value as Record<string, any>;
  if (row.user && typeof row.user === "object") return row.user as Record<string, any>;
  if (row.fid != null || typeof row.username === "string") return row;
  return null;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function actorsFrom(list: unknown): Record<string, any>[] {
  if (!Array.isArray(list)) return [];
  return list.map(actorRecord).filter((actor): actor is Record<string, any> => actor != null);
}

/** Primary actor: reaction/follow aggregates, otherwise the triggering cast's author. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function notificationActor(n: HypersnapNotification): Record<string, any> | null {
  if (n.type === "follow" || n.type === "follows") {
    return actorsFrom(n.follows)[0] ?? n.user ?? null;
  }
  if (isReactionNotification(n)) {
    return actorsFrom(n.reactions)[0] ?? n.user ?? null;
  }
  const author = n.cast?.author;
  if (author && typeof author === "object") return author as Record<string, any>;
  return n.user ?? null;
}

export function notificationActorCount(n: HypersnapNotification): number {
  if (n.type === "follows" || n.type === "follow") {
    const follows = n.follows?.length ?? 0;
    return follows > 0 ? follows : 1;
  }
  if (n.type === "likes" || n.type === "recasts" || n.type === "reaction") {
    const reactions = n.reactions?.length ?? 0;
    return reactions > 0 ? reactions : 1;
  }
  return 1;
}

export { farcasterProfileUrl } from "@/lib/profilePreview";

export function notificationActorDisplayName(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  actor: Record<string, any> | null
): string {
  if (!actor) return "Someone";
  return (
    (actor.display_name as string) ??
    (actor.displayName as string) ??
    (actor.username as string) ??
    "Someone"
  );
}

/** Text after the actor name(s), e.g. " liked your cast". */
export function notificationActionSuffix(
  n: HypersnapNotification,
  count: number
): string {
  const others =
    count > 1 ? ` and ${count - 1} other${count === 2 ? "" : "s"}` : "";

  switch (n.type) {
    case "likes":
      return `${others} liked your cast`;
    case "recasts":
      return `${others} recasted your cast`;
    case "reaction":
      return `${others} reacted to your cast`;
    case "follows":
    case "follow":
      return `${others} followed you`;
    case "reply":
    case "cast-reply":
      return isQuoteCastNotification(n) ? " quoted your cast" : " replied to your cast";
    case "mention":
    case "cast-mention":
      return " mentioned you";
    default:
      return `${others} interacted with you`;
  }
}

export function formatNotificationSummary(n: HypersnapNotification): string {
  const actor = notificationActor(n);
  const name = notificationActorDisplayName(actor);
  const count = notificationActorCount(n);
  return `${name}${notificationActionSuffix(n, count)}`;
}

/** Cast hash to open in the thread panel (reply → reply cast; like → your cast). */
export function notificationCastHash(n: HypersnapNotification): string | null {
  const hash = n.cast?.hash;
  return typeof hash === "string" && hash.length > 0 ? hash : null;
}

export function notificationCastPreview(n: HypersnapNotification): string {
  const text = (n.cast?.text ?? "").trim();
  if (text) return text.length > 120 ? `${text.slice(0, 120)}…` : text;
  if (n.cast?.embeds?.length) return "Embedded media";
  return "";
}

export function isReplyNotification(n: HypersnapNotification): boolean {
  return n.type === "reply" || n.type === "cast-reply";
}

/** Quote casts arrive as `reply` with no parent_hash (not a thread reply). */
export function isQuoteCastNotification(n: HypersnapNotification): boolean {
  if (!isReplyNotification(n)) return false;
  const parentHash = n.cast?.parent_hash;
  return typeof parentHash !== "string" || parentHash.length === 0;
}

export function isThreadReplyNotification(n: HypersnapNotification): boolean {
  return isReplyNotification(n) && !isQuoteCastNotification(n);
}

export function isReactionNotification(n: HypersnapNotification): boolean {
  return n.type === "likes" || n.type === "recasts" || n.type === "reaction";
}

/**
 * Which liker list to open. A `reaction` row does not say like vs recast,
 * so it does not open either list.
 */
export function notificationReactionType(
  n: HypersnapNotification
): "likes" | "recasts" | null {
  if (n.type === "recasts") return "recasts";
  if (n.type === "likes") return "likes";
  return null;
}

/** All actors for aggregated like/recast notifications (when available). */
export function notificationReactionActors(
  n: HypersnapNotification
): Record<string, unknown>[] {
  if (!isReactionNotification(n)) return [];
  const reactions = n.reactions;
  if (Array.isArray(reactions) && reactions.length > 0) {
    return reactions
      .map((r) => (r.user ?? r) as Record<string, unknown>)
      .filter((u) => u && typeof u === "object");
  }
  const actor = notificationActor(n);
  return actor ? [actor] : [];
}

export function isCastTargetNotification(n: HypersnapNotification): boolean {
  return (
    n.type === "likes" ||
    n.type === "recasts" ||
    n.type === "reaction" ||
    isReplyNotification(n) ||
    n.type === "mention" ||
    n.type === "cast-mention"
  );
}

export function notificationParentHash(n: HypersnapNotification): string | null {
  const hash = n.cast?.parent_hash;
  return typeof hash === "string" && hash.length > 0 ? hash : null;
}

/** Unix ms for comparing unread state. */
export function notificationTimestampMs(n: HypersnapNotification): number {
  const raw = n.most_recent_timestamp ?? n.timestamp;
  if (raw == null) return 0;
  const ms =
    typeof raw === "number"
      ? raw < 1e12
        ? raw * 1000
        : raw
      : new Date(raw).getTime();
  return Number.isNaN(ms) ? 0 : ms;
}

export function latestNotificationTimestampMs(
  notifications: HypersnapNotification[]
): number {
  let max = 0;
  for (const n of notifications) {
    max = Math.max(max, notificationTimestampMs(n));
  }
  return max;
}

/** Count aggregated notifications newer than last-seen (peek window capped by API limit). */
/**
 * Keep peek (badge) items visible until the list fetch catches up.
 * Prevents newest notifications flashing then vanishing when list lags peek.
 */
export function mergeNotificationsWithPeek(
  list: HypersnapNotification[],
  peek: HypersnapNotification[]
): HypersnapNotification[] {
  if (peek.length === 0) return list;
  const byKey = new Map<string, HypersnapNotification>();
  for (const n of list) {
    byKey.set(notificationRowKey(n), n);
  }
  for (const n of peek) {
    const key = notificationRowKey(n);
    const existing = byKey.get(key);
    if (
      !existing ||
      notificationTimestampMs(n) > notificationTimestampMs(existing)
    ) {
      byKey.set(key, n);
    }
  }
  const merged = Array.from(byKey.values());
  merged.sort((a, b) => notificationTimestampMs(b) - notificationTimestampMs(a));
  return merged;
}

export function countUnreadNotifications(
  notifications: HypersnapNotification[],
  lastSeenMs: number
): number {
  if (!notifications.length) return 0;
  if (lastSeenMs <= 0) {
    return notifications.length;
  }
  return notifications.filter((n) => notificationTimestampMs(n) > lastSeenMs).length;
}

export function notificationsSeenStorageKey(fid: number): string {
  return `columns:notificationsSeen:${fid}`;
}

export function formatRelativeTime(ms: number): string {
  if (!ms) return "";

  const diff = Date.now() - ms;
  if (diff < 0) return "now";
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return "now";
  if (mins < 60) return `${mins}m`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `${days}d`;
  return new Date(ms).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

export function formatNotificationTime(n: HypersnapNotification): string {
  return formatRelativeTime(notificationTimestampMs(n));
}

function actorFid(actor: NotificationActor): number | null {
  const fid = actor.fid;
  return typeof fid === "number" && fid > 0 ? fid : null;
}

function dedupeActors(actors: NotificationActor[]): NotificationActor[] {
  const seen = new Set<string>();
  const out: NotificationActor[] = [];
  for (const actor of actors) {
    const fid = actorFid(actor);
    const key = fid != null ? `fid:${fid}` : `name:${actor.username ?? ""}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(actor);
  }
  return out;
}

function entryReactionKind(entry: Record<string, any>): "likes" | "recasts" | null {
  const raw = entry.reaction_type ?? entry.reactionType;
  if (raw === "like" || raw === "likes") return "likes";
  if (raw === "recast" || raw === "recasts") return "recasts";
  return null;
}

function rowReactionKind(n: HypersnapNotification): "likes" | "recasts" | null {
  if (n.type === "likes") return "likes";
  if (n.type === "recasts") return "recasts";
  return null;
}

function reactionActorsWithKind(
  n: HypersnapNotification
): Array<{ actor: NotificationActor; kind: "likes" | "recasts" | null }> {
  const fallback = rowReactionKind(n);
  if (Array.isArray(n.reactions) && n.reactions.length > 0) {
    return n.reactions.flatMap((entry) => {
      const actor = actorRecord(entry);
      if (!actor) return [];
      return [{ actor, kind: entryReactionKind(entry) ?? fallback }];
    });
  }
  const actor = notificationActor(n);
  return actor ? [{ actor, kind: fallback }] : [];
}

function singleRowKind(n: HypersnapNotification): NotificationFeedRow["kind"] {
  if (isQuoteCastNotification(n)) return "quote";
  if (isThreadReplyNotification(n)) return "reply";
  if (n.type === "mention" || n.type === "cast-mention") return "mention";
  if (n.type === "follow" || n.type === "follows") return "follow";
  return "other";
}

function actorsForSingle(n: HypersnapNotification): NotificationActor[] {
  if (n.type === "follow" || n.type === "follows") {
    const follows = actorsFrom(n.follows);
    if (follows.length > 0) return dedupeActors(follows);
  }
  const actor = notificationActor(n);
  return actor ? [actor] : [];
}

function newestCast(rows: HypersnapNotification[]): Record<string, any> | null {
  let best: HypersnapNotification | null = null;
  for (const row of rows) {
    if (!row.cast) continue;
    if (!best || notificationTimestampMs(row) >= notificationTimestampMs(best)) best = row;
  }
  return best?.cast ?? null;
}

function reactionModels(
  key: string,
  rows: HypersnapNotification[]
): NotificationFeedRow[] {
  const cast = newestCast(rows);
  const castHash = notificationCastHash(rows.find((row) => notificationCastHash(row)) ?? rows[0]);
  const timestampMs = Math.max(...rows.map(notificationTimestampMs));
  const ordered = [...rows].sort(
    (a, b) => notificationTimestampMs(b) - notificationTimestampMs(a)
  );

  const likes: NotificationActor[] = [];
  const recasts: NotificationActor[] = [];
  const orderedActors: NotificationActor[] = [];
  let hasUnknown = false;
  for (const row of ordered) {
    for (const entry of reactionActorsWithKind(row)) {
      orderedActors.push(entry.actor);
      if (entry.kind === "likes") likes.push(entry.actor);
      else if (entry.kind === "recasts") recasts.push(entry.actor);
      else hasUnknown = true;
    }
  }

  const base = {
    timestampMs,
    cast,
    castHash,
  };

  if (hasUnknown) {
    return [
      {
        ...base,
        key: `reaction:${key}`,
        kind: "reaction",
        actors: dedupeActors(orderedActors),
        pendingSplit: true,
      },
    ];
  }

  const out: NotificationFeedRow[] = [];
  const liked = dedupeActors(likes);
  const recasted = dedupeActors(recasts);
  if (liked.length > 0) {
    out.push({
      ...base,
      key: `likes:${key}`,
      kind: "likes",
      actors: liked,
      pendingSplit: false,
    });
  }
  if (recasted.length > 0) {
    out.push({
      ...base,
      key: `recasts:${key}`,
      kind: "recasts",
      actors: recasted,
      pendingSplit: false,
    });
  }
  return out;
}

/**
 * Collapse likes of one cast into one row and recasts of that cast into another.
 * Replies, mentions, and follows stay one row each.
 */
export function groupNotificationsForDisplay(
  notifications: HypersnapNotification[]
): NotificationFeedRow[] {
  const singles: NotificationFeedRow[] = [];
  const buckets = new Map<string, HypersnapNotification[]>();

  for (const n of notifications) {
    if (!isReactionNotification(n)) {
      singles.push({
        key: notificationRowKey(n),
        kind: singleRowKind(n),
        timestampMs: notificationTimestampMs(n),
        actors: actorsForSingle(n),
        cast: n.cast ?? null,
        castHash: notificationCastHash(n),
        pendingSplit: false,
      });
      continue;
    }
    const hash = notificationCastHash(n);
    const key = hash ?? `row:${notificationRowKey(n)}`;
    const bucket = buckets.get(key) ?? [];
    bucket.push(n);
    buckets.set(key, bucket);
  }

  const reactions: NotificationFeedRow[] = [];
  for (const [key, rows] of buckets) {
    reactions.push(...reactionModels(key, rows));
  }

  return [...singles, ...reactions].sort((a, b) => b.timestampMs - a.timestampMs);
}

/** Split a pending reaction row using FIDs from one cast's like and recast lists. */
export function applyReactionSplit(
  row: NotificationFeedRow,
  likeFids: Set<number>,
  recastFids: Set<number>
): NotificationFeedRow[] {
  if (!row.pendingSplit) return [row];

  const likes: NotificationActor[] = [];
  const recasts: NotificationActor[] = [];
  const rest: NotificationActor[] = [];
  for (const actor of row.actors) {
    const fid = actorFid(actor);
    const liked = fid != null && likeFids.has(fid);
    const recasted = fid != null && recastFids.has(fid);
    if (liked) likes.push(actor);
    if (recasted) recasts.push(actor);
    if (!liked && !recasted) rest.push(actor);
  }

  const out: NotificationFeedRow[] = [];
  if (likes.length > 0) {
    out.push({
      ...row,
      key: `likes:${row.castHash ?? row.key}`,
      kind: "likes",
      actors: likes,
      pendingSplit: false,
    });
  }
  if (recasts.length > 0) {
    out.push({
      ...row,
      key: `recasts:${row.castHash ?? row.key}`,
      kind: "recasts",
      actors: recasts,
      pendingSplit: false,
    });
  }
  if (rest.length > 0) {
    out.push({
      ...row,
      key: `reaction:${row.castHash ?? row.key}`,
      kind: "reaction",
      actors: rest,
      pendingSplit: false,
    });
  }
  return out.length > 0 ? out : [{ ...row, pendingSplit: false }];
}

export function notificationContextLine(
  row: NotificationFeedRow,
  viewerFid: number
): string | null {
  if (row.kind === "quote") return "Quoted your cast";
  if (row.kind === "mention") return "Mentioned you";
  if (row.kind !== "reply") return null;

  const parent = (row.cast?.parent_author ?? row.cast?.parentAuthor) as
    | Record<string, unknown>
    | undefined;
  const fid = parent?.fid;
  const username = parent?.username;
  if (typeof fid === "number" && fid === viewerFid) return "Replying to you";
  if (typeof username === "string" && username) return `Replying to @${username}`;
  return "Replying to you";
}

export function notificationFeedSuffix(row: NotificationFeedRow): string {
  const count = Math.max(row.actors.length, 1);
  const others =
    count > 1 ? ` and ${count - 1} other${count === 2 ? "" : "s"}` : "";
  switch (row.kind) {
    case "likes":
      return `${others} liked your cast`;
    case "recasts":
      return `${others} recasted your cast`;
    case "reaction":
      return `${others} reacted to your cast`;
    case "follow":
      return `${others} followed you`;
    default:
      return "";
  }
}

export function notificationBodyText(row: NotificationFeedRow): string {
  if (row.kind === "follow") return "";
  const text = String(row.cast?.text ?? "").trim();
  if (text) return text;
  const embeds = row.cast?.embeds;
  if (Array.isArray(embeds) && embeds.length > 0) return "Photo";
  return "";
}
