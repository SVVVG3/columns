"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";

interface ImageLightboxProps {
  src: string;
  onClose: () => void;
}

export function ImageLightbox({ src, onClose }: ImageLightboxProps) {
  // Track when we're mounted on the client so createPortal has access to document.body.
  // This also avoids SSR mismatches.
  const [mounted, setMounted] = useState(false);
  useEffect(() => { setMounted(true); }, []);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose]);

  if (!mounted) return null;

  // Render via portal so the lightbox escapes any CSS transform stacking context
  // created by parent containers (e.g. the sidebar's translate-x transforms).
  // This ensures `fixed inset-0` always covers the full viewport.
  return createPortal(
    <div
      className="fixed inset-0 z-[200] flex items-center justify-center bg-black/90 backdrop-blur-sm cursor-pointer"
      onClick={(e) => { e.stopPropagation(); if (e.target === e.currentTarget) onClose(); }}
    >
      <button
        className="absolute top-4 right-4 text-white/70 hover:text-white p-2 rounded-full bg-white/10 hover:bg-white/20 transition-colors cursor-pointer"
        onClick={onClose}
        aria-label="Close"
      >
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
        </svg>
      </button>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={src}
        alt="Full size image"
        className="max-w-[90vw] max-h-[90vh] rounded-lg cursor-default"
        onClick={(e) => e.stopPropagation()}
      />
    </div>,
    document.body
  );
}
