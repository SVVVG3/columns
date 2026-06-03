import { NextRequest } from "next/server";

/**
 * Verifies the request Origin matches the app's own origin.
 * Must be called on all mutating (POST/DELETE/PUT) Route Handlers.
 */
export function verifyCsrf(req: NextRequest): boolean {
  const origin = req.headers.get("origin");
  const host = req.headers.get("host");

  if (!origin || !host) return false;

  try {
    const originHost = new URL(origin).host;
    return originHost === host;
  } catch {
    return false;
  }
}
