"use client";

import Link from "next/link";
import type { SessionUser } from "@/types";

/** Desktop landing for profile-only mini app sessions (no full Columns board). */
export function ProfileOnlyHome({ user }: { user: SessionUser }) {
  const profileHref = user.username
    ? `/profile/${encodeURIComponent(user.username)}`
    : "/profile/me";

  return (
    <div className="min-h-screen flex flex-col items-center justify-center gap-4 bg-[var(--background)] px-6 text-center">
      <p className="text-lg font-semibold text-[var(--foreground)]">Columns profiles</p>
      <p className="text-sm text-[var(--muted)] max-w-sm">
        You&apos;re signed in for Top 8 and profile sharing. Open the full Columns app from a
        browser to use your column board.
      </p>
      <Link
        href={profileHref}
        className="px-5 py-2.5 rounded-xl bg-[var(--accent)] text-white text-sm font-medium"
      >
        View my profile
      </Link>
    </div>
  );
}
