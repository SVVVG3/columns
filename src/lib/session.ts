import { SessionOptions, getIronSession } from "iron-session";
import { cookies } from "next/headers";
import type { SessionUser } from "@/types";

export interface SessionData {
  /** Set after correct beta password — required before SIWN when gate is on. */
  betaUnlocked?: boolean;
  user?: SessionUser;
}

export const sessionOptions: SessionOptions = {
  cookieName: "fc_session",
  password: process.env.SESSION_SECRET as string,
  cookieOptions: {
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    httpOnly: true,
    maxAge: 60 * 60 * 24 * 30, // 30 days
  },
};

export async function getSession() {
  const cookieStore = await cookies();
  return getIronSession<SessionData>(cookieStore, sessionOptions);
}
