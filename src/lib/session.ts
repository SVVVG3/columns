import { SessionOptions, getIronSession, type IronSession } from "iron-session";
import { cookies } from "next/headers";
import type { SessionUser } from "@/types";

/** How long a sealed login stays valid. Renewed on use, at most once a day. */
export const SESSION_TTL_SECONDS = 60 * 60 * 24 * 30;

const SESSION_REFRESH_EVERY_MS = 24 * 60 * 60 * 1000;

export interface SiwfChallenge {
  channelToken: string;
  nonce: string;
  domain: string;
}

/** Signer-approval QR for a FID that signed in but has no stored signer yet. */
export interface PendingSignerApproval {
  signerUuid: string;
  signerApprovalUrl: string | null;
}

export interface SessionData {
  /** Set after correct beta password — required before SIWN when gate is on. */
  betaUnlocked?: boolean;
  user?: SessionUser;
  /** Unix ms when this sealed cookie was last renewed. */
  refreshedAt?: number;
  /** In-progress Sign in with Farcaster channel. */
  siwf?: SiwfChallenge;
  /** Set once a completed SIWF channel has been consumed. */
  siwfClaimed?: boolean;
  approval?: PendingSignerApproval;
}

export function isProfileOnlySession(user?: SessionUser): boolean {
  return !!user?.profileOnly;
}

export const sessionOptions: SessionOptions = {
  cookieName: "fc_session",
  password: process.env.SESSION_SECRET as string,
  ttl: SESSION_TTL_SECONDS,
  cookieOptions: {
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    httpOnly: true,
    maxAge: SESSION_TTL_SECONDS,
  },
};

/** Re-seal the cookie so an active browser does not hit the 30-day expiry. */
export async function touchSession(session: IronSession<SessionData>): Promise<void> {
  if (!session.user && !session.betaUnlocked) return;
  const now = Date.now();
  if (session.refreshedAt && now - session.refreshedAt < SESSION_REFRESH_EVERY_MS) return;
  session.refreshedAt = now;
  await session.save();
}

export async function getSession() {
  const cookieStore = await cookies();
  return getIronSession<SessionData>(cookieStore, sessionOptions);
}
