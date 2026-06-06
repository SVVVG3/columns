import type { HypersnapNotification } from "@/lib/notifications";

/** Client fetch for /api/notifications — never use browser HTTP cache. */
export async function fetchNotificationsApi(
  params: URLSearchParams
): Promise<Response> {
  return fetch(`/api/notifications?${params}`, { cache: "no-store" });
}

export interface NotificationsListPage {
  notifications: HypersnapNotification[];
  next?: { cursor?: string } | null;
}

/** One page for the notifications infinite query (first page uses fresh=1). */
export async function fetchNotificationsListPage(
  pageParam?: string
): Promise<NotificationsListPage> {
  const params = new URLSearchParams({ limit: "20" });
  if (pageParam) params.set("cursor", pageParam);
  else params.set("fresh", "1");
  const res = await fetchNotificationsApi(params);
  if (!res.ok) {
    const json = await res.json().catch(() => ({}));
    throw new Error(
      (json as { error?: string }).error ?? `Notifications failed (${res.status})`
    );
  }
  return res.json() as Promise<NotificationsListPage>;
}
