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

  return {
    ...data,
    notifications: (data.notifications ?? []).map((n) => ({
      ...n,
      cast: n.cast ? normalizeCast(n.cast) : null,
    })),
  };
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
    return n.follows?.length ?? 1;
  }
  if (n.type === "likes" || n.type === "recasts" || n.type === "reaction") {
    return n.reactions?.length ?? 1;
  }
  return 1;
}

export function formatNotificationSummary(n: HypersnapNotification): string {
  const actor = notificationActor(n);
  const name =
    actor?.display_name ?? actor?.displayName ?? actor?.username ?? "Someone";
  const count = notificationActorCount(n);
  const others =
    count > 1 ? ` and ${count - 1} other${count === 2 ? "" : "s"}` : "";

  switch (n.type) {
    case "likes":
      return `${name}${others} liked your cast`;
    case "recasts":
      return `${name}${others} recasted your cast`;
    case "reaction":
      return `${name}${others} reacted to your cast`;
    case "follows":
    case "follow":
      return `${name}${others} followed you`;
    case "reply":
    case "cast-reply":
      return `${name} replied to your cast`;
    case "mention":
    case "cast-mention":
      return `${name} mentioned you`;
    default:
      return `${name} interacted with you`;
  }
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
