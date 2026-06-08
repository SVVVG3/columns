import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getIronSession } from "iron-session";
import { canUseMiniAppColumns, isBetaGateEnabled } from "@/lib/betaGate";
import { sessionOptions, type SessionData } from "@/lib/session";

/** Routes that work before beta password or full sign-in. */
const BETA_PUBLIC_API = [
  "/api/auth/beta",
  "/api/auth/miniapp",
  "/api/profile/public",
  "/api/columns-user",
  "/api/og/profile",
  "/api/miniapp/columns-access",
];

/** Profile mini app APIs readable without auth (GET top8). */
function isProfilePublicRead(pathname: string, method: string): boolean {
  if (method !== "GET") return false;
  return pathname === "/api/profile/top8";
}

/** APIs available to profile-only mini app sessions (no full Columns access). */
const PROFILE_ONLY_ALLOWED_API = [
  "/api/auth/session",
  "/api/auth/miniapp",
  "/api/profile/public",
  "/api/profile/top8",
  "/api/columns-user",
  "/api/user/search",
  "/api/og/profile",
];

function isProfileOnlyAllowedApi(pathname: string): boolean {
  return PROFILE_ONLY_ALLOWED_API.some((p) => pathname.startsWith(p));
}

/** Read-only APIs for allowlisted mini app column viewing (no writes). */
function isMiniAppColumnsReadApi(pathname: string, method: string): boolean {
  if (method !== "GET") return false;
  return (
    pathname === "/api/layout" ||
    pathname.startsWith("/api/feed/") ||
    pathname.startsWith("/api/cast/") ||
    pathname.startsWith("/api/og/") ||
    pathname.startsWith("/api/user/") ||
    pathname.startsWith("/api/channel/") ||
    pathname.startsWith("/api/video-resolve") ||
    pathname.startsWith("/api/token")
  );
}

export async function middleware(request: NextRequest) {
  if (!isBetaGateEnabled()) {
    return NextResponse.next();
  }

  const { pathname } = request.nextUrl;
  if (!pathname.startsWith("/api/")) {
    return NextResponse.next();
  }

  if (
    BETA_PUBLIC_API.some((p) => pathname.startsWith(p)) ||
    isProfilePublicRead(pathname, request.method)
  ) {
    return NextResponse.next();
  }

  const response = NextResponse.next();
  const session = await getIronSession<SessionData>(
    request,
    response,
    sessionOptions
  );

  if (session.user?.profileOnly) {
    if (isProfileOnlyAllowedApi(pathname)) {
      return response;
    }
    if (
      canUseMiniAppColumns(session.user.fid) &&
      isMiniAppColumnsReadApi(pathname, request.method)
    ) {
      return response;
    }
    return NextResponse.json({ error: "Profile mini app only" }, { status: 403 });
  }

  if (session.betaUnlocked || session.user) {
    return response;
  }

  return NextResponse.json({ error: "Beta access required" }, { status: 403 });
}

export const config = {
  matcher: "/api/:path*",
};
