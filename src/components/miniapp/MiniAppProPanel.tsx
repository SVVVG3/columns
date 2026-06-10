"use client";

import Image from "next/image";
import { useCallback, useEffect, useRef, useState } from "react";
import columnsLogo from "../../../public/columns-logo.png";
import farcasterLogoWhite from "../../../public/farcaster-logo-white.png";

export const COLUMNS_PRO_BENEFITS = [
  "Search profiles, casts, FIDs, and wallets across Farcaster",
  "Up to 10 custom columns (free users get 1)",
  "Full desktop Columns experience with multi-column layout",
  "Columns Pro badge on your profile",
] as const;

type WaitlistState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "joined" }
  | { status: "needs_follow"; followsProfile: boolean; followsChannel: boolean }
  | { status: "error" };

interface MiniAppProPanelProps {
  viewerFid?: number;
  followColumnsUrl: string;
  communityUrl: string;
  featureTitle?: string;
  featureDescription?: string;
  /** When false, skip the feature headline block (e.g. settings uses a single combined intro). */
  showFeatureHeader?: boolean;
}

export function MiniAppProPanel({
  viewerFid,
  followColumnsUrl,
  communityUrl,
  featureTitle = "Columns Pro",
  featureDescription = "Free users get Home plus 1 custom column. Pro unlocks search, up to 10 custom columns, and the full desktop experience.",
  showFeatureHeader = true,
}: MiniAppProPanelProps) {
  const [waitlist, setWaitlist] = useState<WaitlistState>({ status: "idle" });
  const hasFetchedWaitlist = useRef(false);

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
    checkWaitlistStatus();
  }, [checkWaitlistStatus]);

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
    <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] overflow-hidden">
      <div className="px-4 pt-4 pb-3 border-b border-[var(--border)]">
        <div className="flex items-center gap-2">
          <Image src={columnsLogo} alt="" width={24} height={24} className="rounded-md object-cover" />
          <h2 className="text-sm font-semibold text-[var(--foreground)]">Columns Pro</h2>
        </div>
        {showFeatureHeader && (
          <>
            <p className="mt-2 text-sm font-medium text-[var(--foreground)]">{featureTitle}</p>
            <p className="mt-1 text-xs text-[var(--muted)] leading-relaxed">{featureDescription}</p>
          </>
        )}
        {!showFeatureHeader && (
          <p className="mt-2 text-xs text-[var(--muted)] leading-relaxed">{featureDescription}</p>
        )}
      </div>

      <div className="px-4 py-3 space-y-2">
        <p className="text-[10px] font-semibold uppercase tracking-wide text-[var(--muted)]">
          Pro benefits
        </p>
        <ul className="space-y-1.5">
          {COLUMNS_PRO_BENEFITS.map((benefit) => (
            <li key={benefit} className="flex items-start gap-2 text-xs text-[var(--foreground)]">
              <span className="text-[var(--accent)] shrink-0 mt-0.5">✓</span>
              <span>{benefit}</span>
            </li>
          ))}
        </ul>
      </div>

      <div className="px-4 pb-4 space-y-2 border-t border-[var(--border)] pt-3">
        {waitlist.status === "joined" ? (
          <p className="text-sm font-medium text-[var(--recast)] text-center py-1">
            You&apos;re on the waitlist — we&apos;ll notify you when Pro opens up!
          </p>
        ) : waitlist.status === "needs_follow" ? (
          <div className="space-y-1 text-xs">
            <p className="font-semibold text-[var(--foreground)]">To join the waitlist:</p>
            <p className={waitlist.followsProfile ? "text-[var(--recast)]" : "text-[var(--muted)]"}>
              {waitlist.followsProfile ? "✓" : "○"} Follow{" "}
              <a href={followColumnsUrl} target="_blank" rel="noopener noreferrer" className="underline">
                @columns
              </a>
            </p>
            <p className={waitlist.followsChannel ? "text-[var(--recast)]" : "text-[var(--muted)]"}>
              {waitlist.followsChannel ? "✓" : "○"} Follow the{" "}
              <a
                href="https://farcaster.xyz/~/channel/columns"
                target="_blank"
                rel="noopener noreferrer"
                className="underline"
              >
                /columns
              </a>{" "}
              channel
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
            className="w-full py-2.5 rounded-xl border border-red-400/40 text-sm font-medium text-red-400 hover:bg-[var(--surface-hover)]"
          >
            Something went wrong — try again
          </button>
        ) : (
          <button
            type="button"
            onClick={() => (viewerFid ? void handleJoinWaitlist() : undefined)}
            disabled={waitlist.status === "loading" || !viewerFid}
            className="w-full py-2.5 rounded-xl bg-[var(--accent)] hover:bg-[var(--accent-hover)] disabled:opacity-50 text-white text-sm font-medium transition-colors"
          >
            {waitlist.status === "loading" ? "Checking…" : "Join Waitlist for Columns Pro"}
          </button>
        )}

        <div className="flex gap-2">
          <a
            href={followColumnsUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="flex-1 flex items-center justify-center gap-2 py-2 rounded-xl border border-[var(--border)] text-xs font-medium text-[var(--foreground)] hover:bg-[var(--surface-hover)]"
          >
            <Image src={columnsLogo} alt="" width={14} height={14} className="rounded-sm" />
            Follow
          </a>
          <a
            href={communityUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="flex-1 flex items-center justify-center gap-2 py-2 rounded-xl border border-[var(--border)] text-xs font-medium text-[var(--foreground)] hover:bg-[var(--surface-hover)]"
          >
            <Image src={farcasterLogoWhite} alt="" width={14} height={14} className="rounded-sm" />
            Community
          </a>
        </div>
      </div>
    </div>
  );
}
