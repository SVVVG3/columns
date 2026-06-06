"use client";

import { useEffect, useRef } from "react";
import { NotificationsPanel } from "@/components/layout/NotificationsPanel";
import { useUiStore } from "@/store/ui";

interface NotificationsModalProps {
  open: boolean;
  /** Incremented in Sidebar each time the user opens notifications — busts list cache. */
  listSession: number;
  onClose: () => void;
  viewerFid: number;
  onFreshLoad?: (latestMs: number) => void;
}

/** Centered notifications modal (spotlight-style, like profile search). */
export function NotificationsModal({
  open,
  listSession,
  onClose,
  viewerFid,
  onFreshLoad,
}: NotificationsModalProps) {
  const profilePreviewOpen = useUiStore((s) => s.profilePreview != null);
  const conversationOpen = useUiStore((s) => s.selectedCastHash != null);
  const childOverlayOpen = profilePreviewOpen || conversationOpen;
  const ignoreBackdropUntilRef = useRef(0);

  useEffect(() => {
    if (childOverlayOpen) return;
    ignoreBackdropUntilRef.current = Date.now() + 400;
  }, [childOverlayOpen]);

  useEffect(() => {
    if (!open) return;
    function onKeyDown(e: KeyboardEvent) {
      if (e.key !== "Escape") return;
      const { profilePreview, selectedCastHash } = useUiStore.getState();
      if (profilePreview || selectedCastHash) return;
      onClose();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className={`fixed inset-0 z-[70] flex items-start justify-center pt-[12vh] px-4 bg-black/55 backdrop-blur-md transition-[filter,opacity] duration-200 ${
        childOverlayOpen ? "pointer-events-none" : ""
      }`}
      role="presentation"
      onClick={
        childOverlayOpen
          ? undefined
          : () => {
              if (Date.now() < ignoreBackdropUntilRef.current) return;
              onClose();
            }
      }
      aria-hidden={childOverlayOpen}
    >
      <div
        className={`w-full max-w-md bg-[var(--surface)] border border-[var(--border)] rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[min(75vh,560px)] transition-all duration-200 ${
          childOverlayOpen ? "blur-md opacity-40 scale-[0.98]" : ""
        }`}
        role="dialog"
        aria-label="Notifications"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-3 px-4 py-3.5 border-b border-[var(--border)] shrink-0">
          <h2 className="text-base font-semibold text-[var(--foreground)] flex-1">
            Notifications
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-[var(--muted)] hover:text-[var(--foreground)] hover:bg-[var(--surface-hover)] transition-colors"
            aria-label="Close"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          </button>
          <kbd className="hidden sm:inline text-[10px] text-[var(--muted)] border border-[var(--border)] rounded px-1.5 py-0.5 font-mono">
            esc
          </kbd>
        </div>

        <NotificationsPanel
          open={open}
          listSession={listSession}
          onClose={onClose}
          viewerFid={viewerFid}
          onFreshLoad={onFreshLoad}
        />
      </div>
    </div>
  );
}
