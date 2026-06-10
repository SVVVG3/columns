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
  "/api/waitlist",
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
  "/api/feed/home",
  "/api/layout",
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

/** Write APIs allowed for mini app users with a stored managed signer. */
function isMiniAppWriteApi(pathname: string, method: string): boolean {
  if (method !== "POST" && method !== "DELETE") return false;
  return (
    pathname === "/api/reaction" ||
    pathname === "/api/cast" ||
    pathname === "/api/upload/cast-image"
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
    if (isMiniAppColumnsReadApi(pathname, request.method)) {
      return response;
    }
    if (
      pathname === "/api/cast/search" &&
      request.method === "GET" &&
      canUseMiniAppColumns(session.user.fid)
    ) {
      return response;
    }
    if (
      canUseMiniAppColumns(session.user.fid) &&
      session.user.signerUuid?.trim() &&
      isMiniAppWriteApi(pathname, request.method)
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
