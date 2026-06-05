import { timingSafeEqual } from "crypto";

/** Server-only — compares against BETA_ACCESS_PASSWORD. */
export function verifyBetaPassword(password: string): boolean {
  const expected = process.env.BETA_ACCESS_PASSWORD ?? "";
  if (!expected || !password) return false;
  const a = Buffer.from(password);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}
