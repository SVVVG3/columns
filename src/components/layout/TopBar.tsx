"use client";

import type { SessionUser } from "@/types";
import { UserAvatar } from "@/components/ui/UserAvatar";
import { useState } from "react";
import { ComposeModal } from "@/components/cast/ComposeModal";
import { AddColumnModal } from "@/components/feed/AddColumnModal";

interface TopBarProps {
  user: SessionUser;
  onLogout: () => void;
}

export function TopBar({ user, onLogout }: TopBarProps) {
  const [composeOpen, setComposeOpen] = useState(false);
  const [addColumnOpen, setAddColumnOpen] = useState(false);

  return (
    <>
      <header className="flex items-center justify-between px-4 h-12 border-b border-[var(--border)] bg-black shrink-0 z-20">
        {/* Left: logo */}
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg bg-[var(--accent)] flex items-center justify-center">
            <svg viewBox="0 0 1000 1000" className="w-4 h-4 fill-white" aria-hidden="true">
              <path d="M257.778 155.556h484.444v688.889h-71.111V528.889H528.89l85.333 315.556h-71.111l-85.334-315.556H328.889v315.556h-71.111V155.556z" />
              <path d="M128.889 253.333L157.778 351.111H182.222V746.667C169.778 746.667 160 756.444 160 768.889V795.556H155.556C143.111 795.556 133.333 805.333 133.333 817.778V844.444H382.222V817.778C382.222 805.333 372.444 795.556 360 795.556H355.556V768.889C355.556 756.444 345.778 746.667 333.333 746.667H306.667V253.333H128.889ZM617.778 746.667C605.333 746.667 595.556 768.889V795.556H591.111C578.667 795.556 568.889 805.333 568.889 817.778V844.444H817.778V817.778C817.778 805.333 808 795.556 795.556 795.556H791.111V768.889C791.111 756.444 781.333 746.667 768.889 746.667V351.111H793.333L822.222 253.333H644.444V746.667H617.778Z" />
            </svg>
          </div>
          <span className="font-semibold text-sm text-white">Farcaster</span>
        </div>

        {/* Center: compose */}
        <button
          onClick={() => setComposeOpen(true)}
          className="flex items-center gap-2 px-4 py-1.5 rounded-full bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-white text-sm font-medium transition-colors"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          Cast
        </button>

        {/* Right: add column + avatar */}
        <div className="flex items-center gap-3">
          <button
            onClick={() => setAddColumnOpen(true)}
            title="Add column"
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-[var(--border)] hover:border-[var(--muted)] text-[var(--muted)] hover:text-white text-xs transition-colors"
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            Add column
          </button>

          <div className="relative group">
            <UserAvatar
              src={user.pfpUrl}
              alt={user.displayName}
              size="md"
              className="cursor-pointer ring-2 ring-transparent group-hover:ring-[var(--accent)] transition-all"
            />
            {/* Dropdown */}
            <div className="absolute right-0 top-full mt-2 w-48 bg-[var(--surface)] border border-[var(--border)] rounded-xl shadow-xl opacity-0 group-hover:opacity-100 pointer-events-none group-hover:pointer-events-auto transition-opacity z-50">
              <div className="px-3 py-2 border-b border-[var(--border)]">
                <p className="text-sm font-medium text-white truncate">{user.displayName}</p>
                <p className="text-xs text-[var(--muted)] truncate">@{user.username}</p>
              </div>
              <button
                onClick={onLogout}
                className="w-full text-left px-3 py-2 text-sm text-[var(--muted)] hover:text-white hover:bg-[var(--surface-hover)] rounded-b-xl transition-colors"
              >
                Sign out
              </button>
            </div>
          </div>
        </div>
      </header>

      {composeOpen && (
        <ComposeModal onClose={() => setComposeOpen(false)} />
      )}
      {addColumnOpen && (
        <AddColumnModal onClose={() => setAddColumnOpen(false)} />
      )}
    </>
  );
}
