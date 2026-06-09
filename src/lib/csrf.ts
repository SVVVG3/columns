import { NextRequest } from "next/server";

function hostMatchesRequest(host: string, url: string): boolean {
  try {
    return new URL(url).host === host;
  } catch {
    return false;
  }
}

/**
 * Verifies the request Origin matches the app's own origin.
 * Must be called on all mutating (POST/DELETE/PUT) Route Handlers.
 *
 * Farcaster mini-app WebViews often omit `Origin` on fetch(); accept `Referer`
 * or `Sec-Fetch-Site: same-origin` as fallbacks for same-host requests.
 */
export function verifyCsrf(req: NextRequest): boolean {
  const host = req.headers.get("host");
  if (!host) return false;

  const origin = req.headers.get("origin");
  if (origin && origin !== "null" && hostMatchesRequest(host, origin)) {
    return true;
  }

  const referer = req.headers.get("referer");
  if (referer && hostMatchesRequest(host, referer)) {
    return true;
  }

  const secFetchSite = req.headers.get("sec-fetch-site");
  if (secFetchSite === "same-origin" || secFetchSite === "same-site") {
    return true;
  }

  return false;
}
