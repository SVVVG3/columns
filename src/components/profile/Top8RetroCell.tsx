"use client";

import Image from "next/image";
import columnsLogo from "../../../public/columns-logo.png";
import { TOP8_RETRO } from "@/lib/top8RetroTheme";
import type { Top8Slot } from "@/types";

function OnlineNowBadge() {
  return (
    <p className="mt-1.5 text-[9px] font-bold leading-none text-center">
      <span style={{ color: TOP8_RETRO.accentMuted }}>(</span>
      <span
        className="inline-block w-2 h-2 rounded-full align-middle mx-0.5"
        style={{ background: TOP8_RETRO.accent }}
      />
      <span style={{ color: TOP8_RETRO.accentMuted }}>)</span>{" "}
      <span style={{ color: TOP8_RETRO.online }}>Online Now!</span>
    </p>
  );
}

export function Top8RetroCell({
  slot,
  showColumnsBadge,
  onClick,
  disabled,
}: {
  slot: Top8Slot;
  showColumnsBadge: boolean;
  onClick?: () => void;
  disabled?: boolean;
}) {
  const displayName = slot.displayName || slot.username;

  return (
    <div className="relative flex flex-col items-center min-w-0">
      <button
        type="button"
        onClick={onClick}
        disabled={disabled}
        className={`flex flex-col items-center min-w-0 w-full ${
          disabled ? "cursor-default" : "hover:opacity-85 transition-opacity"
        }`}
      >
        <span
          className="inline-flex items-center justify-center gap-1 text-[11px] font-bold truncate w-full text-center mb-1 min-w-0"
          style={{ color: TOP8_RETRO.link }}
        >
          {showColumnsBadge && (
            <Image
              src={columnsLogo}
              alt=""
              width={12}
              height={12}
              className="rounded-sm object-cover shrink-0"
            />
          )}
          <span className="truncate">{displayName}</span>
        </span>
        <div
          className="p-0.5 w-full"
          style={{ background: TOP8_RETRO.panelBorder }}
        >
          {slot.pfpUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={slot.pfpUrl}
              alt=""
              className="w-full aspect-square object-cover"
            />
          ) : (
            <div
              className="w-full aspect-square"
              style={{ background: TOP8_RETRO.photoPlaceholder }}
            />
          )}
        </div>
        <OnlineNowBadge />
      </button>
    </div>
  );
}
