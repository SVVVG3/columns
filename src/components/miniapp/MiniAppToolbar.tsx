"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import columnsLogo from "../../../public/columns-logo.png";
import farcasterLogoWhite from "../../../public/farcaster-logo-white.png";

interface MiniAppToolbarProps {
  /** Viewer's profile picture URL — shown as the right-most avatar button. */
  viewerPfp?: string | null;
  /** Where Follow Columns links to (external Farcaster URL). */
  followColumnsUrl: string;
  /** Where Join Community links to (external Farcaster URL). */
  communityUrl: string;
  /** Highlight the center logo when on the Columns feed page. */
  activePage?: "columns" | "profile";
}

export function MiniAppToolbar({
  viewerPfp,
  followColumnsUrl,
  communityUrl,
  activePage,
}: MiniAppToolbarProps) {
  const [infoOpen, setInfoOpen] = useState(false);
  const infoRef = useRef<HTMLDivElement>(null);

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

  return (
    <div className="shrink-0 border-t border-[var(--border)] bg-[var(--background)] px-6 py-2 max-w-lg mx-auto w-full">
      <div className="flex items-center justify-between">
        {/* Left: Info button → popover with Follow Columns + Join Community */}
        <div ref={infoRef} className="relative">
          <button
            type="button"
            onClick={() => setInfoOpen((o) => !o)}
            className="w-11 h-11 flex items-center justify-center rounded-full hover:bg-[var(--surface-hover)] text-[var(--muted)] hover:text-[var(--foreground)] transition-colors"
            aria-label="Info"
            aria-expanded={infoOpen}
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </button>

          {infoOpen && (
            <div className="absolute bottom-full left-0 mb-2 w-52 rounded-xl border border-[var(--border)] bg-[var(--surface)] shadow-lg overflow-hidden z-20">
              <a
                href={followColumnsUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-3 px-4 py-3 text-sm font-medium text-[var(--foreground)] hover:bg-[var(--surface-hover)]"
                onClick={() => setInfoOpen(false)}
              >
                <Image
                  src={columnsLogo}
                  alt=""
                  width={18}
                  height={18}
                  className="rounded-sm object-cover shrink-0"
                />
                Follow Columns
              </a>
              <a
                href={communityUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-3 px-4 py-3 text-sm font-medium text-[var(--foreground)] hover:bg-[var(--surface-hover)] border-t border-[var(--border)]"
                onClick={() => setInfoOpen(false)}
              >
                <Image
                  src={farcasterLogoWhite}
                  alt=""
                  width={18}
                  height={18}
                  className="rounded-sm object-cover shrink-0"
                />
                Join Community
              </a>
            </div>
          )}
        </div>

        {/* Center: Columns logo → /columns */}
        <Link
          href="/columns"
          className={`w-11 h-11 flex items-center justify-center rounded-full transition-colors ${
            activePage === "columns"
              ? "bg-[var(--accent)]/15"
              : "hover:bg-[var(--surface-hover)]"
          }`}
          aria-label="My Columns"
        >
          <Image
            src={columnsLogo}
            alt="Columns"
            width={28}
            height={28}
            className="rounded-md object-cover"
          />
        </Link>

        {/* Right: Profile avatar → /profile/me */}
        <Link
          href="/profile/me"
          className={`w-11 h-11 flex items-center justify-center rounded-full transition-colors ${
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
              width={36}
              height={36}
              className="w-9 h-9 rounded-full object-cover"
            />
          ) : (
            <div className="w-9 h-9 rounded-full bg-[var(--surface-hover)]" />
          )}
        </Link>
      </div>
    </div>
  );
}
