"use client";

import { useEffect } from "react";
import { MiniAppProPanel } from "@/components/miniapp/MiniAppProPanel";

interface MiniAppProUpsellModalProps {
  open: boolean;
  onClose: () => void;
  viewerFid?: number;
  followColumnsUrl: string;
  communityUrl: string;
  featureTitle: string;
  featureDescription: string;
}

export function MiniAppProUpsellModal({
  open,
  onClose,
  viewerFid,
  followColumnsUrl,
  communityUrl,
  featureTitle,
  featureDescription,
}: MiniAppProUpsellModalProps) {
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[90] flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-sm px-4 pb-6 sm:pb-0"
      onClick={onClose}
    >
      <div className="w-full max-w-sm" onClick={(e) => e.stopPropagation()} role="dialog" aria-label="Columns Pro">
        <MiniAppProPanel
          viewerFid={viewerFid}
          followColumnsUrl={followColumnsUrl}
          communityUrl={communityUrl}
          featureTitle={featureTitle}
          featureDescription={featureDescription}
        />
        <button
          type="button"
          onClick={onClose}
          className="w-full mt-2 py-2 text-xs text-[var(--muted)] hover:text-[var(--foreground)]"
        >
          Not now
        </button>
      </div>
    </div>
  );
}
