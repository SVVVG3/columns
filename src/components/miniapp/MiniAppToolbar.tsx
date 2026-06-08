"use client";

import Image from "next/image";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import columnsLogo from "../../../public/columns-logo.png";
import farcasterLogoWhite from "../../../public/farcaster-logo-white.png";

interface MiniAppToolbarProps {
  /** Viewer's profile picture URL — shown as the right-most avatar button. */
  viewerPfp?: string | null;
  /** Viewer's FID — required to enable the waitlist flow. */
  viewerFid?: number;
  /** Where Follow Columns links to (external Farcaster URL). */
  followColumnsUrl: string;
  /** Where Join Community links to (external Farcaster URL). */
  communityUrl: string;
  /** Highlight the center logo when on the Columns feed page. */
  activePage?: "columns" | "profile";
}

type WaitlistState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "joined" }
  | { status: "needs_follow"; followsProfile: boolean; followsChannel: boolean }
  | { status: "error" };

export function MiniAppToolbar({
  viewerPfp,
  viewerFid,
  followColumnsUrl,
  communityUrl,
  activePage,
}: MiniAppToolbarProps) {
  const router = useRouter();
  const [infoOpen, setInfoOpen] = useState(false);
  const [waitlist, setWaitlist] = useState<WaitlistState>({ status: "idle" });
  const infoRef = useRef<HTMLDivElement>(null);
  // Tracks whether we've already done the initial waitlist status fetch so we
  // don't re-run the check every time the popover state changes.
  const hasFetchedWaitlist = useRef(false);

  // Pre-load both pages for instant tab switching
  useEffect(() => {
    router.prefetch("/columns");
    router.prefetch("/profile/me");
  }, [router]);

  // Check waitlist status once when the popover first opens.
  // Intentionally NOT including waitlist.status — changing it must not retrigger
  // the initial fetch (that caused an infinite "Checking…" loop).
  const checkWaitlistStatus = useCallback(() => {
    if (!viewerFid || hasFetchedWaitlist.current) return;
    hasFetchedWaitlist.current = true;
    setWaitlist({ status: "loading" });
    void fetch(`/api/waitlist?fid=${viewerFid}`)
      .then((r) => r.json() as Promise<{ onWaitlist?: boolean }>)
      .then((data) => {
        setWaitlist(data.onWaitlist ? { status: "joined" } : { status: "idle" });
      })
      .catch(() => setWaitlist({ status: "idle" }));
  }, [viewerFid]);

  useEffect(() => {
    if (infoOpen) checkWaitlistStatus();
  }, [infoOpen, checkWaitlistStatus]);

  useEffect(() => {
    if (!infoOpen) return;
    function onPointerDown(e: MouseEvent) {
      if (infoRef.current && !infoRef.current.contains(e.target as Node)) {
        setInfoOpen(false);
      }
    }
    document.addEventListener("mousedown", onPointerDown);
    return () => document.removeEventListener("mousedown", onPointerDown);
  }, [infoOpen]);

  async function handleJoinWaitlist() {
    if (!viewerFid) return;
    setWaitlist({ status: "loading" });
    try {
      const res = await fetch("/api/waitlist", { method: "POST" });
      const data = (await res.json()) as {
        ok?: boolean;
        needsFollow?: boolean;
        followsProfile?: boolean;
        followsChannel?: boolean;
      };
      if (data.ok) {
        setWaitlist({ status: "joined" });
      } else if (data.needsFollow) {
        setWaitlist({
          status: "needs_follow",
          followsProfile: data.followsProfile ?? false,
          followsChannel: data.followsChannel ?? false,
        });
      } else {
        setWaitlist({ status: "error" });
      }
    } catch {
      setWaitlist({ status: "error" });
    }
  }

  return (
    <div className="shrink-0 border-t border-[var(--border)] bg-[var(--background)] px-6 py-3 max-w-lg mx-auto w-full">
      <div className="flex items-center justify-between">
        {/* Left: Info button → popover */}
        <div ref={infoRef} className="relative">
          <button
            type="button"
            onClick={() => setInfoOpen((o) => !o)}
            className="w-14 h-14 flex items-center justify-center rounded-full hover:bg-[var(--surface-hover)] text-[var(--muted)] hover:text-[var(--foreground)] transition-colors"
            aria-label="Info"
            aria-expanded={infoOpen}
          >
            <svg className="w-7 h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </button>

          {infoOpen && (
            <div className="absolute bottom-full left-0 mb-2 w-64 rounded-xl border border-[var(--border)] bg-[var(--surface)] shadow-lg overflow-hidden z-20">
              {/* Follow Columns */}
              <a
                href={followColumnsUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-3 px-4 py-3 text-sm font-medium text-[var(--foreground)] hover:bg-[var(--surface-hover)]"
                onClick={() => setInfoOpen(false)}
              >
                <Image src={columnsLogo} alt="" width={18} height={18} className="rounded-sm object-cover shrink-0" />
                Follow Columns
              </a>

              {/* Join Community */}
              <a
                href={communityUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-3 px-4 py-3 text-sm font-medium text-[var(--foreground)] hover:bg-[var(--surface-hover)] border-t border-[var(--border)]"
                onClick={() => setInfoOpen(false)}
              >
                <Image src={farcasterLogoWhite} alt="" width={18} height={18} className="rounded-sm object-cover shrink-0" />
                Join Community
              </a>

              {/* Join Waitlist */}
              <div className="border-t border-[var(--border)]">
                {waitlist.status === "joined" ? (
                  <div className="flex items-center gap-3 px-4 py-3">
                    <span className="text-[var(--recast)] text-lg leading-none">✓</span>
                    <span className="text-sm font-medium text-[var(--recast)]">You're on the waitlist!</span>
                  </div>
                ) : waitlist.status === "needs_follow" ? (
                  <div className="px-4 py-3 space-y-1">
                    <p className="text-xs font-semibold text-[var(--foreground)]">To join the waitlist:</p>
                    <p className={`text-xs ${waitlist.followsProfile ? "text-[var(--recast)]" : "text-[var(--muted)]"}`}>
                      {waitlist.followsProfile ? "✓" : "○"} Follow <a href={followColumnsUrl} target="_blank" rel="noopener noreferrer" className="underline">@columns</a>
                    </p>
                    <p className={`text-xs ${waitlist.followsChannel ? "text-[var(--recast)]" : "text-[var(--muted)]"}`}>
                      {waitlist.followsChannel ? "✓" : "○"} Follow the <a href="https://farcaster.xyz/~/channel/columns" target="_blank" rel="noopener noreferrer" className="underline">/columns</a> channel
                    </p>
                    <button
                      type="button"
                      onClick={() => void handleJoinWaitlist()}
                      className="mt-1 text-xs font-medium text-[var(--accent)] hover:underline"
                    >
                      Check again →
                    </button>
                  </div>
                ) : waitlist.status === "error" ? (
                  <button
                    type="button"
                    onClick={() => void handleJoinWaitlist()}
                    className="w-full flex items-center gap-3 px-4 py-3 text-sm font-medium text-red-400 hover:bg-[var(--surface-hover)]"
                  >
                    Something went wrong — try again
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => viewerFid ? void handleJoinWaitlist() : undefined}
                    disabled={waitlist.status === "loading" || !viewerFid}
                    className="w-full flex items-center gap-3 px-4 py-3 text-sm font-medium text-[var(--foreground)] hover:bg-[var(--surface-hover)] disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <span className="text-base leading-none">🎟</span>
                    {waitlist.status === "loading" ? "Checking…" : "Join Waitlist"}
                  </button>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Center: Columns logo → /columns — largest, most prominent */}
        <Link
          href="/columns"
          className={`w-16 h-16 flex items-center justify-center transition-all ${
            activePage === "columns" ? "scale-105" : "hover:scale-105"
          }`}
          aria-label="My Columns"
        >
          <Image
            src={columnsLogo}
            alt="Columns"
            width={56}
            height={56}
            className="rounded-xl object-cover"
          />
        </Link>

        {/* Right: Profile avatar → /profile/me */}
        <Link
          href="/profile/me"
          className={`w-14 h-14 flex items-center justify-center rounded-full transition-colors ${
            activePage === "profile"
              ? "ring-2 ring-[var(--accent)] ring-offset-2 ring-offset-[var(--background)]"
              : "hover:opacity-80"
          }`}
          aria-label="My Profile"
        >
          {viewerPfp ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={viewerPfp}
              alt=""
              width={44}
              height={44}
              className="w-11 h-11 rounded-full object-cover"
            />
          ) : (
            <div className="w-11 h-11 rounded-full bg-[var(--surface-hover)]" />
          )}
        </Link>
      </div>
    </div>
  );
}
