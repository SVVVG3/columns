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
    notifications: aggregateNotifications(normalized),
  };
}

/** Group key: same type + cast (likes/recasts) or follow bucket by hour. */
export function aggregateNotificationKey(n: HypersnapNotification): string {
  const type = n.type;
  if (type === "follows" || type === "follow") {
    const ms = notificationTimestampMs(n);
    const hour = ms > 0 ? Math.floor(ms / 3_600_000) : 0;
    return `follow:${hour}`;
  }
  const hash = n.cast?.hash;
  if (typeof hash === "string" && hash.length > 0) {
    return `${type}:${hash}`;
  }
  return `${type}:${notificationTimestampMs(n)}`;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function dedupeActors(actors: Record<string, any>[]): Record<string, any>[] {
  const seen = new Set<number>();
  const out: Record<string, any>[] = [];
  for (const a of actors) {
    if (!a) continue;
    const fid = a.fid as number | undefined;
    if (fid != null) {
      if (seen.has(fid)) continue;
      seen.add(fid);
    }
    out.push(a);
  }
  return out;
}

/**
 * Merge duplicate rows from Hypersnap (e.g. many likes on one cast).
 * Server docs describe aggregation; the public node often returns one row per actor.
 */
export function aggregateNotifications(
  notifications: HypersnapNotification[]
): HypersnapNotification[] {
  const groups = new Map<string, HypersnapNotification>();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const actorsByKey = new Map<string, Record<string, any>[]>();
  const order: string[] = [];

  for (const n of notifications) {
    const key = aggregateNotificationKey(n);
    const ts = notificationTimestampMs(n);

    if (!groups.has(key)) {
      groups.set(key, { ...n });
      actorsByKey.set(key, n.user ? [n.user] : []);
      order.push(key);
      continue;
    }

    const existing = groups.get(key)!;
    const actors = actorsByKey.get(key)!;
    if (n.user) actors.push(n.user);

    if (ts > notificationTimestampMs(existing)) {
      existing.timestamp = n.timestamp;
      existing.most_recent_timestamp = n.most_recent_timestamp;
    }
  }

  return order.map((key) => {
    const n = groups.get(key)!;
    const actors = dedupeActors(actorsByKey.get(key) ?? []);
    const count = actors.length;

    if (count <= 1) {
      return { ...n, user: actors[0] ?? n.user };
    }

    if (n.type === "likes" || n.type === "recasts" || n.type === "reaction") {
      return {
        ...n,
        user: actors[0],
        reactions: actors.map((user) => ({ user })),
      };
    }

    if (n.type === "follows" || n.type === "follow") {
      return {
        ...n,
        user: actors[0],
        follows: actors.map((user) => ({ user })),
      };
    }

    // Replies / mentions: keep separate unless same key (unusual)
    return { ...n, user: actors[0] };
  });
}

/** Primary actor for this notification (liker, replier, follower). */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function notificationActor(n: HypersnapNotification): Record<string, any> | null {
  if (n.user) return n.user;
  const reactions = n.reactions;
  if (Array.isArray(reactions) && reactions.length > 0) {
    const first = reactions[0];
    return first?.user ?? first ?? null;
  }
  const follows = n.follows;
  if (Array.isArray(follows) && follows.length > 0) {
    return follows[0]?.user ?? follows[0] ?? null;
  }
  return null;
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
  const raw = n.timestamp ?? n.most_recent_timestamp;
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

export function formatNotificationTime(n: HypersnapNotification): string {
  const ms = notificationTimestampMs(n);
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
