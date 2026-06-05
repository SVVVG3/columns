/** Client fetch for /api/notifications — never use browser HTTP cache. */
export async function fetchNotificationsApi(
  params: URLSearchParams
): Promise<Response> {
  return fetch(`/api/notifications?${params}`, { cache: "no-store" });
}
