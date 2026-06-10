"use client";

import Image from "next/image";
import { useCallback, useEffect, useRef, useState } from "react";
import { useTheme } from "@/components/layout/Providers";
import { MiniAppToolbar } from "@/components/miniapp/MiniAppToolbar";
import {
  columnsCommunityChannelUrl,
  columnsFarcasterProfileUrl,
} from "@/lib/appUrl";
import { miniappSession } from "@/lib/miniappSession";
import type { SessionUser } from "@/types";
import columnsLogo from "../../../public/columns-logo.png";
import farcasterLogoWhite from "../../../public/farcaster-logo-white.png";

type WaitlistState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "joined" }
  | { status: "needs_follow"; followsProfile: boolean; followsChannel: boolean }
  | { status: "error" };

async function fetchSessionUser(): Promise<SessionUser | null> {
  const res = await fetch("/api/auth/miniapp", { cache: "no-store" });
  if (!res.ok) return null;
  const data = (await res.json()) as { user?: SessionUser | null };
  return data.user ?? null;
}

export function MiniAppSettingsClient() {
  const cached = miniappSession.read();
  const [viewer, setViewer] = useState<SessionUser | null>(cached?.viewer ?? null);
  const [isPro, setIsPro] = useState(cached?.allowed ?? false);
  const { theme, toggleTheme } = useTheme();
  const [waitlist, setWaitlist] = useState<WaitlistState>({ status: "idle" });
  const hasFetchedWaitlist = useRef(false);

  useEffect(() => {
    void (async () => {
      const user = await fetchSessionUser();
      if (user) setViewer(user);
      const session = miniappSession.read();
      if (session) setIsPro(session.allowed);
    })();
  }, []);

  const checkWaitlistStatus = useCallback(() => {
    const fid = viewer?.fid;
    if (!fid || hasFetchedWaitlist.current) return;
    hasFetchedWaitlist.current = true;
    setWaitlist({ status: "loading" });
    void fetch(`/api/waitlist?fid=${fid}`)
      .then((r) => r.json() as Promise<{ onWaitlist?: boolean }>)
      .then((data) => {
        setWaitlist(data.onWaitlist ? { status: "joined" } : { status: "idle" });
      })
      .catch(() => setWaitlist({ status: "idle" }));
  }, [viewer?.fid]);

  useEffect(() => {
    checkWaitlistStatus();
  }, [checkWaitlistStatus]);

  async function handleJoinWaitlist() {
    if (!viewer?.fid) return;
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

  const columnsUrl = columnsFarcasterProfileUrl();
  const communityUrl = columnsCommunityChannelUrl();

  return (
    <div className="h-full min-h-0 flex flex-col bg-[var(--background)] text-[var(--foreground)] max-w-lg mx-auto w-full">
      <div className="flex-1 min-h-0 overflow-y-auto">
        <div className="px-4 py-5">
          <h1 className="text-lg font-semibold">Settings</h1>
          <p className="text-xs text-[var(--muted)] mt-1">
            {isPro ? "Columns Pro member" : "Free Columns member"}
          </p>
        </div>

        <div className="px-4 space-y-1">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-[var(--muted)] px-1 pb-1">
            Appearance
          </p>
          <button
            type="button"
            onClick={toggleTheme}
            className="w-full flex items-center justify-between gap-3 px-4 py-3 rounded-xl border border-[var(--border)] bg-[var(--surface)] hover:bg-[var(--surface-hover)] transition-colors"
          >
            <span className="text-sm font-medium">Theme</span>
            <span className="text-sm text-[var(--muted)]">
              {theme === "dark" ? "Dark" : "Light"}
            </span>
          </button>
        </div>

        <div className="px-4 mt-6 space-y-1">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-[var(--muted)] px-1 pb-1">
            Community
          </p>
          <a
            href={columnsUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-3 px-4 py-3 rounded-xl border border-[var(--border)] bg-[var(--surface)] hover:bg-[var(--surface-hover)] transition-colors"
          >
            <Image src={columnsLogo} alt="" width={18} height={18} className="rounded-sm object-cover shrink-0" />
            <span className="text-sm font-medium">Follow Columns</span>
          </a>
          <a
            href={communityUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-3 px-4 py-3 rounded-xl border border-[var(--border)] bg-[var(--surface)] hover:bg-[var(--surface-hover)] transition-colors"
          >
            <Image src={farcasterLogoWhite} alt="" width={18} height={18} className="rounded-sm object-cover shrink-0" />
            <span className="text-sm font-medium">Join Community</span>
          </a>
        </div>

        <div className="px-4 mt-6 space-y-2">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-[var(--muted)] px-1 pb-1">
            Columns Pro
          </p>
          <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] px-4 py-3">
            {waitlist.status === "joined" ? (
              <div className="flex items-center gap-2">
                <span className="text-[var(--recast)]">✓</span>
                <span className="text-sm font-medium text-[var(--recast)]">You&apos;re on the waitlist!</span>
              </div>
            ) : waitlist.status === "needs_follow" ? (
              <div className="space-y-1 text-xs">
                <p className="font-semibold text-[var(--foreground)]">To join the waitlist:</p>
                <p className={waitlist.followsProfile ? "text-[var(--recast)]" : "text-[var(--muted)]"}>
                  {waitlist.followsProfile ? "✓" : "○"} Follow{" "}
                  <a href={columnsUrl} target="_blank" rel="noopener noreferrer" className="underline">
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
                className="text-sm font-medium text-red-400 hover:underline"
              >
                Something went wrong — try again
              </button>
            ) : (
              <button
                type="button"
                onClick={() => (viewer?.fid ? void handleJoinWaitlist() : undefined)}
                disabled={waitlist.status === "loading" || !viewer?.fid}
                className="w-full flex items-center gap-3 text-sm font-medium text-[var(--foreground)] disabled:opacity-50"
              >
                <span className="text-base leading-none">🎟</span>
                {waitlist.status === "loading" ? "Checking…" : "Join Waitlist"}
              </button>
            )}
            {!isPro && (
              <p className="mt-2 text-[11px] text-[var(--muted)] leading-relaxed">
                Pro unlocks search, up to 10 custom columns, and the full desktop experience.
              </p>
            )}
          </div>
        </div>
      </div>

      <MiniAppToolbar
        viewerPfp={viewer?.pfpUrl}
        viewerFid={viewer?.fid}
        isPro={isPro}
        followColumnsUrl={columnsUrl}
        communityUrl={communityUrl}
        activePage="settings"
      />
    </div>
  );
}
