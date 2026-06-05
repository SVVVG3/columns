import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getIronSession } from "iron-session";
import { isBetaGateEnabled } from "@/lib/betaGate";
import { sessionOptions, type SessionData } from "@/lib/session";

/** Routes that work before beta password (auth screen only). */
const BETA_PUBLIC_API = ["/api/auth/beta"];

export async function middleware(request: NextRequest) {
  if (!isBetaGateEnabled()) {
    return NextResponse.next();
  }

  const { pathname } = request.nextUrl;
  if (!pathname.startsWith("/api/")) {
    return NextResponse.next();
  }

  if (BETA_PUBLIC_API.some((p) => pathname.startsWith(p))) {
    return NextResponse.next();
  }

  const response = NextResponse.next();
  const session = await getIronSession<SessionData>(
    request,
    response,
    sessionOptions
  );

  if (session.betaUnlocked || session.user) {
    return response;
  }

  return NextResponse.json({ error: "Beta access required" }, { status: 403 });
}

export const config = {
  matcher: "/api/:path*",
};
