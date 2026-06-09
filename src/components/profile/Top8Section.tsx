"use client";

import Image from "next/image";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { sdk } from "@farcaster/miniapp-sdk";
import { Top8RetroCell } from "@/components/profile/Top8RetroCell";
import { UserAvatar } from "@/components/ui/UserAvatar";
import { TOP8_RETRO } from "@/lib/top8RetroTheme";
import { useUiStore } from "@/store/ui";
import columnsLogo from "../../../public/columns-logo.png";
import type { Top8Slot } from "@/types";

interface Top8DraftSlot {
  position: number;
  fid: number;
  username: string;
  displayName: string;
  pfpUrl: string | null;
}

async function fetchTop8(fid: number): Promise<Top8Slot[]> {
  const res = await fetch(`/api/profile/top8?fid=${fid}`);
  if (!res.ok) throw new Error("Failed to load Top 8");
  const data = (await res.json()) as { slots?: Top8Slot[] };
  return data.slots ?? [];
}

interface SearchUser {
  fid: number;
  username: string;
  display_name?: string;
  pfp_url?: string;
}

/** Stable default — `data: slots = []` creates a new [] each render and retriggers effects. */
const EMPTY_TOP8: Top8Slot[] = [];

export function Top8Section({
  ownerFid,
  isOwnProfile,
  linkMode = false,
  onProfileNavigate,
}: {
  ownerFid: number;
  isOwnProfile: boolean;
  /** Navigate to /profile/:user instead of in-app modal */
  linkMode?: boolean;
  /** Mini app: custom navigation (e.g. push back stack before routing) */
  onProfileNavigate?: (username: string) => void;
}) {
  const router = useRouter();
  const openProfilePreview = useUiStore((s) => s.openProfilePreview);
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<Top8DraftSlot[]>([]);
  const [searchQ, setSearchQ] = useState("");
  const [searchResults, setSearchResults] = useState<SearchUser[]>([]);
  const [searching, setSearching] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const { data: slots, isLoading } = useQuery({
    queryKey: ["top8", ownerFid],
    queryFn: () => fetchTop8(ownerFid),
    staleTime: 60_000,
  });
  const resolvedSlots = slots ?? EMPTY_TOP8;

  const { data: badgeMap = new Map<number, boolean>() } = useQuery({
    queryKey: ["top8-badges", ownerFid, resolvedSlots.map((s) => s.fid).join(",")],
    queryFn: async () => {
      const fids = [...new Set(resolvedSlots.map((s) => s.fid))];
      const entries = await Promise.all(
        fids.map(async (fid) => {
          const res = await fetch(`/api/columns-user?fid=${fid}`);
          if (!res.ok) return [fid, false] as const;
          const data = (await res.json()) as { showBadge?: boolean };
          return [fid, !!data.showBadge] as const;
        })
      );
      return new Map(entries);
    },
    enabled: resolvedSlots.length > 0,
    staleTime: 300_000,
  });

  useEffect(() => {
    if (!editing) return;
    setDraft(resolvedSlots.map((s) => ({ ...s })));
    setSearchQ("");
    setSearchResults([]);
    setSaveError(null);
    // Only reset the editor when opening — not on every parent re-render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editing]);

  const runSearch = useCallback(async (q: string) => {
    const trimmed = q.trim();
    if (!trimmed) {
      setSearchResults([]);
      return;
    }
    setSearching(true);
    try {
      const res = await fetch(`/api/user/search?q=${encodeURIComponent(trimmed)}`);
      const data = (await res.json()) as { users?: SearchUser[] };
      setSearchResults(data.users ?? []);
    } catch {
      setSearchResults([]);
    } finally {
      setSearching(false);
    }
  }, []);

  useEffect(() => {
    if (!editing) return;
    const t = setTimeout(() => void runSearch(searchQ), 300);
    return () => clearTimeout(t);
  }, [editing, searchQ, runSearch]);

  function addUser(user: SearchUser) {
    if (draft.length >= 8) return;
    if (draft.some((s) => s.fid === user.fid)) return;
    if (user.fid === ownerFid) return;
    const nextPosition =
      draft.length === 0 ? 1 : Math.max(...draft.map((s) => s.position)) + 1;
    setDraft((prev) => [
      ...prev,
      {
        position: nextPosition,
        fid: user.fid,
        username: user.username,
        displayName: user.display_name ?? user.username,
        pfpUrl: user.pfp_url ?? null,
      },
    ]);
    setSearchQ("");
    setSearchResults([]);
  }

  function removeSlot(fid: number) {
    setDraft((prev) => {
      const filtered = prev.filter((s) => s.fid !== fid);
      return filtered.map((s, i) => ({ ...s, position: i + 1 }));
    });
  }

  async function saveTop8() {
    setSaving(true);
    setSaveError(null);
    const body = JSON.stringify({
      slots: draft.map((s) => ({
        position: s.position,
        targetFid: s.fid,
      })),
    });
    try {
      let res: Response;
      try {
        res = await sdk.quickAuth.fetch("/api/profile/top8", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body,
        });
      } catch {
        res = await fetch("/api/profile/top8", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body,
        });
      }
      const data = (await res.json().catch(() => ({}))) as {
        error?: string;
        slots?: Top8Slot[];
      };
      if (!res.ok) {
        setSaveError(data.error ?? "Could not save Top 8");
        return;
      }
      queryClient.setQueryData(["top8", ownerFid], data.slots ?? draft);
      setEditing(false);
    } catch {
      setSaveError("Could not save Top 8");
    } finally {
      setSaving(false);
    }
  }

  const displaySlots = editing ? draft : resolvedSlots;
  const showSection = isOwnProfile || displaySlots.length > 0 || isLoading;

  if (!showSection) return null;

  function handleSlotClick(slot: Top8Slot) {
    if (editing) return;
    if (linkMode) {
      if (onProfileNavigate) {
        onProfileNavigate(slot.username);
        return;
      }
      router.push(`/profile/${encodeURIComponent(slot.username)}`);
      return;
    }
    openProfilePreview({
      fid: slot.fid,
      username: slot.username,
      displayName: slot.displayName,
      pfpUrl: slot.pfpUrl ?? undefined,
    });
  }

  const retroPanel = linkMode;

  const gridContent = (
    <>
      {isLoading && !editing && (
        <div className={`grid grid-cols-4 gap-3 ${retroPanel ? "p-3" : ""}`}>
          {[...Array(8)].map((_, i) => (
            <div
              key={i}
              className={`aspect-square animate-pulse ${
                retroPanel ? "bg-[#2a2a35]" : "rounded-lg bg-[var(--surface-hover)] h-14"
              }`}
            />
          ))}
        </div>
      )}

      {!isLoading && !editing && displaySlots.length === 0 && isOwnProfile && (
        <p
          className={`text-xs text-center ${retroPanel ? "p-4" : ""}`}
          style={retroPanel ? { color: TOP8_RETRO.textMuted } : undefined}
        >
          Pick up to 8 friends to show here.
        </p>
      )}

      {displaySlots.length > 0 && (
        <div className={`grid grid-cols-4 gap-3 ${retroPanel ? "p-3" : ""}`}>
          {displaySlots.map((slot) =>
            retroPanel ? (
              <div key={slot.fid} className="relative min-w-0">
                <Top8RetroCell
                  slot={slot}
                  showColumnsBadge={badgeMap.get(slot.fid) ?? false}
                  onClick={() => handleSlotClick(slot)}
                  disabled={editing}
                />
                {editing && (
                  <button
                    type="button"
                    onClick={() => removeSlot(slot.fid)}
                    className="absolute top-0 right-0 w-4 h-4 rounded-full bg-[var(--surface)] border border-[var(--border)] text-[var(--muted)] hover:text-[var(--foreground)] text-[10px] leading-none z-10"
                    aria-label={`Remove @${slot.username}`}
                  >
                    ×
                  </button>
                )}
              </div>
            ) : (
              <div key={slot.fid} className="relative flex flex-col items-center gap-1 min-w-0">
                <button
                  type="button"
                  onClick={() => handleSlotClick(slot)}
                  className={`flex flex-col items-center gap-1 min-w-0 w-full ${
                    editing ? "cursor-default" : "hover:opacity-80 transition-opacity"
                  }`}
                  disabled={editing}
                >
                  <div className="relative">
                    <UserAvatar src={slot.pfpUrl} alt={slot.displayName} size="md" />
                    {(badgeMap.get(slot.fid) ?? false) && (
                      <span className="absolute -bottom-1 -right-1 w-4 h-4 rounded-sm bg-[var(--surface)] flex items-center justify-center ring-1 ring-[var(--border)]">
                        <Image src={columnsLogo} alt="" width={10} height={10} className="rounded-[2px] object-cover" />
                      </span>
                    )}
                  </div>
                  <span className="text-[10px] text-[var(--foreground)] truncate w-full text-center">
                    @{slot.username}
                  </span>
                </button>
                {editing && (
                  <button
                    type="button"
                    onClick={() => removeSlot(slot.fid)}
                    className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-[var(--surface)] border border-[var(--border)] text-[var(--muted)] hover:text-[var(--foreground)] text-[10px] leading-none"
                    aria-label={`Remove @${slot.username}`}
                  >
                    ×
                  </button>
                )}
              </div>
            )
          )}
        </div>
      )}
    </>
  );

  if (retroPanel) {
    return (
      <div
        className="mt-4 w-full overflow-hidden"
        style={{
          border: `2px solid ${TOP8_RETRO.panelBorder}`,
          background: TOP8_RETRO.panel,
        }}
      >
        <div
          className="flex items-center justify-between gap-2 px-3 py-2"
          style={{ background: TOP8_RETRO.accent }}
        >
          <p className="text-sm font-bold text-white">Top 8</p>
          {isOwnProfile && !editing && (
            <button
              type="button"
              onClick={() => setEditing(true)}
              className="text-[11px] font-medium text-white/90 hover:text-white hover:underline"
            >
              Edit
            </button>
          )}
        </div>
        <div
          className="border-b-2"
          style={{ borderColor: TOP8_RETRO.accent }}
        />
        {gridContent}
        {editing && (
          <div className="px-3 pb-3 space-y-2">
            {draft.length < 8 && (
              <div>
                <input
                  type="text"
                  value={searchQ}
                  onChange={(e) => setSearchQ(e.target.value)}
                  placeholder="Search @username to add…"
                  autoFocus
                  className="w-full px-3 py-2 rounded-lg border text-sm text-[var(--foreground)] placeholder:text-[var(--muted)]"
                  style={{
                    borderColor: TOP8_RETRO.panelBorder,
                    background: TOP8_RETRO.outerBg,
                  }}
                />
                {searching && (
                  <p className="text-[10px] text-[var(--muted)] mt-1">Searching…</p>
                )}
                {searchResults.length > 0 && (
                  <ul className="mt-1 rounded-lg border overflow-hidden max-h-32 overflow-y-auto feed-scroll"
                    style={{ borderColor: TOP8_RETRO.panelBorder }}
                  >
                    {searchResults.map((u) => {
                      const added = draft.some((s) => s.fid === u.fid);
                      return (
                        <li key={u.fid}>
                          <button
                            type="button"
                            disabled={added || u.fid === ownerFid}
                            onClick={() => addUser(u)}
                            className="w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-[var(--surface-hover)] disabled:opacity-50 text-sm"
                          >
                            <UserAvatar src={u.pfp_url} alt={u.username} size="sm" />
                            <span className="truncate">@{u.username}</span>
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>
            )}
            {saveError && (
              <p className="text-xs text-red-400 text-center">{saveError}</p>
            )}
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setEditing(false)}
                className="flex-1 py-2 rounded-lg border text-sm font-medium text-[var(--foreground)] hover:bg-[var(--surface-hover)]"
                style={{ borderColor: TOP8_RETRO.panelBorder }}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => void saveTop8()}
                disabled={saving}
                className="flex-1 py-2 rounded-lg bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-white text-sm font-medium disabled:opacity-50"
              >
                {saving ? "Saving…" : "Save"}
              </button>
            </div>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="mt-4 w-full border-t border-[var(--border)] pt-3">
      <div className="flex items-center justify-between gap-2 mb-2">
        <p className="text-[10px] font-semibold uppercase tracking-wide text-[var(--muted)]">
          Top 8
        </p>
        {isOwnProfile && !editing && (
          <button
            type="button"
            onClick={() => setEditing(true)}
            className="text-[10px] font-medium text-[var(--accent)] hover:underline"
          >
            Edit
          </button>
        )}
      </div>

      {gridContent}

      {editing && (
        <div className="mt-3 space-y-2">
          {draft.length < 8 && (
            <div>
              <input
                type="text"
                value={searchQ}
                onChange={(e) => setSearchQ(e.target.value)}
                placeholder="Search @username to add…"
                autoFocus
                className="w-full px-3 py-2 rounded-lg border border-[var(--border)] bg-[var(--background)] text-sm text-[var(--foreground)] placeholder:text-[var(--muted)]"
              />
              {searching && (
                <p className="text-[10px] text-[var(--muted)] mt-1">Searching…</p>
              )}
              {searchResults.length > 0 && (
                <ul className="mt-1 rounded-lg border border-[var(--border)] overflow-hidden max-h-32 overflow-y-auto feed-scroll">
                  {searchResults.map((u) => {
                    const added = draft.some((s) => s.fid === u.fid);
                    return (
                      <li key={u.fid}>
                        <button
                          type="button"
                          disabled={added || u.fid === ownerFid}
                          onClick={() => addUser(u)}
                          className="w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-[var(--surface-hover)] disabled:opacity-50 text-sm"
                        >
                          <UserAvatar src={u.pfp_url} alt={u.username} size="sm" />
                          <span className="truncate">@{u.username}</span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          )}
          {saveError && (
            <p className="text-xs text-red-400 text-center">{saveError}</p>
          )}
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setEditing(false)}
              className="flex-1 py-2 rounded-xl border border-[var(--border)] text-sm font-medium text-[var(--foreground)] hover:bg-[var(--surface-hover)]"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={() => void saveTop8()}
              disabled={saving}
              className="flex-1 py-2 rounded-xl bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-white text-sm font-medium disabled:opacity-50"
            >
              {saving ? "Saving…" : "Save"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
