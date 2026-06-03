"use client";

import { useState } from "react";
import type { FeedColumnConfig } from "@/types";
import {
  exportShareableColumn,
  getColumnShareUrl,
  slugifyColumnTitle,
} from "@/lib/layoutShare";

interface ShareColumnModalProps {
  column: FeedColumnConfig;
  onClose: () => void;
}

export function ShareColumnModal({ column, onClose }: ShareColumnModalProps) {
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [copied, setCopied] = useState<"link" | "json" | null>(null);

  const shareable = exportShareableColumn(column);
  const shareUrl = getColumnShareUrl(column);
  const json = JSON.stringify(shareable, null, 2);
  const filename = `farcaster-column-${slugifyColumnTitle(column.title)}.json`;

  async function copyText(text: string, kind: "link" | "json") {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(kind);
      setSuccess(kind === "link" ? "Share link copied" : "Column JSON copied");
      setError(null);
      setTimeout(() => setCopied(null), 2000);
    } catch {
      setError("Could not copy to clipboard");
    }
  }

  function downloadJson() {
    const blob = new Blob([json], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
    setSuccess("Column file downloaded");
    setError(null);
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center pt-16 bg-black/70 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md bg-[var(--surface)] border border-[var(--border)] rounded-2xl shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-4 pt-4 pb-2 border-b border-[var(--border)]">
          <h2 className="text-sm font-semibold text-[var(--foreground)] truncate pr-2">
            Share column — {column.title}
          </h2>
          <button
            onClick={onClose}
            className="text-[var(--muted)] hover:text-[var(--foreground)] transition-colors p-1 shrink-0"
            aria-label="Close"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="p-4 space-y-3">
          <p className="text-xs text-[var(--muted)]">
            Others can open your share link to add this column to their board (they keep their existing columns).
          </p>
          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => copyText(shareUrl, "link")}
              className="px-3 py-1.5 rounded-lg bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-white text-xs font-medium transition-colors"
            >
              {copied === "link" ? "Copied!" : "Copy share link"}
            </button>
            <button
              onClick={() => copyText(json, "json")}
              className="px-3 py-1.5 rounded-lg border border-[var(--border)] text-xs text-[var(--foreground)] hover:bg-[var(--surface-hover)] transition-colors"
            >
              {copied === "json" ? "Copied!" : "Copy JSON"}
            </button>
            <button
              onClick={downloadJson}
              className="px-3 py-1.5 rounded-lg border border-[var(--border)] text-xs text-[var(--foreground)] hover:bg-[var(--surface-hover)] transition-colors"
            >
              Download .json
            </button>
          </div>
          {error && <p className="text-xs text-red-400">{error}</p>}
          {success && <p className="text-xs text-green-400">{success}</p>}
        </div>
      </div>
    </div>
  );
}
