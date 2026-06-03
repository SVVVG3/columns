/**
 * Hypersnap read API helper.
 *
 * All Hypersnap read endpoints are unauthenticated — no API key required.
 * Set HYPERSNAP_URL in env to point at a self-hosted node; defaults to the
 * public Quilibrium node.
 */

const BASE_URL =
  (process.env.HYPERSNAP_URL ?? "https://haatz.quilibrium.com").replace(/\/$/, "");

/**
 * Typed fetch against the Hypersnap HTTP API.
 * Throws on non-2xx responses with a message that includes the status and path.
 */
export async function hsnap<T>(
  path: string,
  params?: Record<string, string | number | undefined>
): Promise<T> {
  const url = new URL(`${BASE_URL}${path}`);

  if (params) {
    for (const [key, value] of Object.entries(params)) {
      if (value !== undefined && value !== null && value !== "") {
        url.searchParams.set(key, String(value));
      }
    }
  }

  const res = await fetch(url.toString(), {
    headers: { Accept: "application/json" },
    // Revalidate at most every 30s at the edge (Vercel CDN), but always
    // check the in-process feedCache first — the cache TTL is authoritative.
    next: { revalidate: 30 },
  });

  if (!res.ok) {
    let detail = "";
    try {
      const body = await res.json();
      detail = body?.message ?? JSON.stringify(body);
    } catch {
      detail = await res.text().catch(() => "");
    }
    throw new Error(`Hypersnap ${res.status} at ${path}: ${detail}`);
  }

  return res.json() as Promise<T>;
}
