"use client";

import Image from "next/image";
import { useState } from "react";
import columnsLogo from "../../../public/columns-logo.png";

const SETUP_STEPS = [
  "On your computer, open the Columns link below.",
  "Sign in with Farcaster and approve read/write permissions.",
  "Your Columns Pro badge will appear on your profile automatically.",
] as const;

interface MiniAppProBadgePanelProps {
  desktopUrl: string;
}

/** Pro allowlist users who have not completed desktop SIWN for badge + write access. */
export function MiniAppProBadgePanel({ desktopUrl }: MiniAppProBadgePanelProps) {
  const [copied, setCopied] = useState(false);
  const [shareError, setShareError] = useState(false);

  const hostname = (() => {
    try {
      return new URL(desktopUrl).hostname;
    } catch {
      return "mycolumns.xyz";
    }
  })();

  const canShare =
    typeof navigator !== "undefined" && typeof navigator.share === "function";

  async function copyLink() {
    setShareError(false);
    try {
      await navigator.clipboard.writeText(desktopUrl);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      setShareError(true);
    }
  }

  async function shareLink() {
    setShareError(false);
    try {
      await navigator.share({
        title: "Columns",
        text: "Sign in to Columns on desktop to finish Pro setup",
        url: desktopUrl,
      });
    } catch (err) {
      if (err instanceof Error && err.name === "AbortError") return;
      setShareError(true);
    }
  }

  return (
    <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] overflow-hidden">
      <div className="px-4 pt-4 pb-3 border-b border-[var(--border)]">
        <div className="flex items-center gap-2">
          <Image src={columnsLogo} alt="" width={24} height={24} className="rounded-md object-cover" />
          <h2 className="text-sm font-semibold text-[var(--foreground)]">Columns Pro</h2>
        </div>
        <p className="mt-2 text-xs text-[var(--muted)] leading-relaxed">
          You have Pro access in the mini app. Sign in once on a computer to grant Columns read/write
          permissions and show your Pro badge on your profile.
        </p>
      </div>

      <div className="px-4 py-3 space-y-2">
        <p className="text-[10px] font-semibold uppercase tracking-wide text-[var(--muted)]">
          One-time setup
        </p>
        <ol className="space-y-2">
          {SETUP_STEPS.map((step, i) => (
            <li key={step} className="flex items-start gap-2.5 text-xs text-[var(--foreground)]">
              <span className="w-5 h-5 rounded-full bg-[var(--accent)]/15 text-[var(--accent)] text-[10px] font-bold flex items-center justify-center shrink-0">
                {i + 1}
              </span>
              <span className="leading-relaxed pt-0.5">{step}</span>
            </li>
          ))}
        </ol>
      </div>

      <div className="px-4 pb-4 border-t border-[var(--border)] pt-3 space-y-2">
        <div className="px-3 py-2.5 rounded-xl border border-[var(--border)] bg-[var(--background)] text-center">
          <p className="text-[10px] text-[var(--muted)] uppercase tracking-wide">Desktop link</p>
          <p className="mt-0.5 text-sm font-medium text-[var(--foreground)]">{hostname}</p>
        </div>

        <button
          type="button"
          onClick={() => void copyLink()}
          className="w-full py-2.5 rounded-xl bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-white text-sm font-medium transition-colors"
        >
          {copied ? "Link copied!" : "Copy link for desktop"}
        </button>

        {canShare && (
          <button
            type="button"
            onClick={() => void shareLink()}
            className="w-full py-2.5 rounded-xl border border-[var(--border)] text-sm font-medium text-[var(--foreground)] hover:bg-[var(--surface-hover)] transition-colors"
          >
            Send link to yourself
          </button>
        )}

        {shareError && (
          <p className="text-[10px] text-center text-red-400">
            Couldn&apos;t copy — type <span className="font-mono">{hostname}</span> on your computer.
          </p>
        )}

        <p className="text-[10px] text-center text-[var(--muted)] leading-snug">
          Paste the link in your computer&apos;s browser. Use the same Farcaster account you&apos;re signed in
          with here.
        </p>
      </div>
    </div>
  );
}
