"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { UserAvatar } from "@/components/ui/UserAvatar";
import { profileSeedFromUnknown } from "@/lib/profilePreview";
import { useUiStore } from "@/store/ui";

interface SearchUser {
  fid: number;
  username: string;
  display_name?: string;
  pfp_url?: string;
}

interface SearchCast {
  hash: string;
  text?: string;
  timestamp?: string;
  author?: {
    username?: string;
    display_name?: string;
    pfp_url?: string;
  };
}

interface ProfileSearchModalProps {
  open: boolean;
  onClose: () => void;
}

type SearchHit =
  | { kind: "user"; user: SearchUser }
  | { kind: "cast"; cast: SearchCast };

async function fetchUserSearch(q: string): Promise<SearchUser[]> {
  const res = await fetch(`/api/user/search?q=${encodeURIComponent(q)}`);
  const data = (await res.json()) as { users?: SearchUser[]; error?: string };
  if (!res.ok) throw new Error(data.error ?? "Search failed");
  return data.users ?? [];
}

async function fetchCastSearch(q: string): Promise<SearchCast[]> {
  const res = await fetch(`/api/cast/search?q=${encodeURIComponent(q)}&limit=20`);
  const data = (await res.json()) as { casts?: SearchCast[]; error?: string };
  if (!res.ok) throw new Error(data.error ?? "Cast search failed");
  return data.casts ?? [];
}

/** Spotlight search: profiles (username, FID, ETH, X) and casts by keyword. */
export function ProfileSearchModal({ open, onClose }: ProfileSearchModalProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const openProfilePreview = useUiStore((s) => s.openProfilePreview);
  const openConversation = useUiStore((s) => s.openConversation);
  const profilePreviewOpen = useUiStore((s) => s.profilePreview != null);
  const conversationOpen = useUiStore((s) => s.selectedCastHash != null);
  const childOverlayOpen = profilePreviewOpen || conversationOpen;

  useEffect(() => {
    if (!open) return;
    setQuery("");
    setDebouncedQuery("");
    setActiveIndex(0);
    const t = window.setTimeout(() => inputRef.current?.focus(), 0);
    return () => window.clearTimeout(t);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const t = window.setTimeout(() => setDebouncedQuery(query.trim()), 280);
    return () => window.clearTimeout(t);
  }, [query, open]);

  const usersQuery = useQuery({
    queryKey: ["profileSearch", debouncedQuery],
    queryFn: () => fetchUserSearch(debouncedQuery),
    enabled: open && debouncedQuery.length > 0,
    staleTime: 30_000,
  });

  const castsQuery = useQuery({
    queryKey: ["castSearch", debouncedQuery],
    queryFn: () => fetchCastSearch(debouncedQuery),
    enabled: open && debouncedQuery.length > 0,
    staleTime: 30_000,
  });

  const users = usersQuery.data ?? [];
  const casts = castsQuery.data ?? [];
  const hits = useMemo<SearchHit[]>(
    () => [
      ...users.map((user) => ({ kind: "user" as const, user })),
      ...casts.map((cast) => ({ kind: "cast" as const, cast })),
    ],
    [users, casts]
  );

  const isLoading =
    debouncedQuery.length > 0 &&
    (usersQuery.isLoading ||
      usersQuery.isFetching ||
      castsQuery.isLoading ||
      castsQuery.isFetching);
  const isError = usersQuery.isError || castsQuery.isError;
  const error = usersQuery.error ?? castsQuery.error;

  useEffect(() => {
    setActiveIndex(0);
  }, [debouncedQuery, hits.length]);

  useEffect(() => {
    if (!open) return;
    function onKeyDown(e: KeyboardEvent) {
      const { profilePreview, selectedCastHash } = useUiStore.getState();
      if (profilePreview || selectedCastHash) return;

      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
        return;
      }
      if (hits.length === 0) return;
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setActiveIndex((i) => Math.min(i + 1, hits.length - 1));
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setActiveIndex((i) => Math.max(i - 1, 0));
      } else if (e.key === "Enter") {
        e.preventDefault();
        selectHit(hits[activeIndex]);
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, onClose, hits, activeIndex]);

  function selectHit(hit: SearchHit | undefined) {
    if (!hit) return;
    if (hit.kind === "user") {
      const seed = profileSeedFromUnknown(hit.user);
      if (seed) openProfilePreview(seed);
    } else if (hit.cast.hash) {
      openConversation(hit.cast.hash);
    }
  }

  if (!open) return null;

  const showResults = debouncedQuery.length > 0;
  const pending = showResults && isLoading;
  const empty =
    showResults && !pending && !isError && users.length === 0 && casts.length === 0;
  let hitIndex = 0;

  return (
    <div
      className={`fixed inset-0 z-[70] flex items-start justify-center pt-[14vh] px-4 bg-black/55 backdrop-blur-md transition-[filter,opacity] duration-200 ${
        childOverlayOpen ? "pointer-events-none" : ""
      }`}
      role="presentation"
      onClick={childOverlayOpen ? undefined : onClose}
      aria-hidden={childOverlayOpen}
    >
      <div
        className={`w-full max-w-xl bg-[var(--surface)] border border-[var(--border)] rounded-2xl shadow-2xl overflow-hidden transition-all duration-200 ${
          childOverlayOpen ? "blur-md opacity-40 scale-[0.98]" : ""
        }`}
        role="dialog"
        aria-label="Search"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-3 px-4 py-3.5 border-b border-[var(--border)]">
          <IconSearch className="w-5 h-5 text-[var(--muted)] shrink-0" />
          <input
            ref={inputRef}
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Profiles, casts, FID, wallet, or X handle…"
            className="flex-1 bg-transparent text-base text-[var(--foreground)] placeholder:text-[var(--muted)] outline-none"
            autoComplete="off"
            spellCheck={false}
          />
          <kbd className="hidden sm:inline text-[10px] text-[var(--muted)] border border-[var(--border)] rounded px-1.5 py-0.5 font-mono">
            esc
          </kbd>
        </div>

        <div className="max-h-[min(50vh,360px)] overflow-y-auto feed-scroll">
          {!showResults && (
            <p className="px-4 py-8 text-sm text-center text-[var(--muted)]">
              Search profiles or casts — username, FID, wallet, X handle, or keywords in cast text.
            </p>
          )}

          {showResults && pending && hits.length === 0 && (
            <div className="px-4 py-6 space-y-2 animate-pulse">
              {[...Array(4)].map((_, i) => (
                <div key={i} className="flex gap-3 items-center">
                  <div className="w-9 h-9 rounded-full bg-[var(--surface-hover)] shrink-0" />
                  <div className="flex-1 space-y-1.5">
                    <div className="h-2.5 w-28 rounded bg-[var(--surface-hover)]" />
                    <div className="h-2 w-20 rounded bg-[var(--surface-hover)]" />
                  </div>
                </div>
              ))}
            </div>
          )}

          {showResults && isError && (
            <p className="px-4 py-6 text-sm text-center text-red-400">
              {friendlySearchError(error)}
            </p>
          )}

          {empty && (
            <p className="px-4 py-6 text-sm text-center text-[var(--muted)]">
              No results for &ldquo;{debouncedQuery}&rdquo;
            </p>
          )}

          {users.length > 0 && (
            <>
              <p className="px-4 pt-3 pb-1 text-[10px] font-semibold uppercase tracking-wide text-[var(--muted)]">
                Profiles
              </p>
              {users.map((u) => {
                const index = hitIndex++;
                const active = index === activeIndex;
                const name = u.display_name ?? u.username;
                return (
                  <button
                    key={`u-${u.fid}`}
                    type="button"
                    onMouseEnter={() => setActiveIndex(index)}
                    onClick={() => selectHit({ kind: "user", user: u })}
                    className={rowClass(active)}
                  >
                    <UserAvatar src={u.pfp_url} alt={name} size="lg" />
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-[var(--foreground)] truncate">{name}</p>
                      <p className="text-xs text-[var(--muted)] truncate">
                        @{u.username}
                        <span className="mx-1.5">·</span>
                        <span className="font-mono">FID {u.fid}</span>
                      </p>
                    </div>
                  </button>
                );
              })}
            </>
          )}

          {casts.length > 0 && (
            <>
              <p className="px-4 pt-3 pb-1 text-[10px] font-semibold uppercase tracking-wide text-[var(--muted)]">
                Casts
              </p>
              {casts.map((c) => {
                const index = hitIndex++;
                const active = index === activeIndex;
                const author = c.author?.display_name ?? c.author?.username ?? "Unknown";
                const username = c.author?.username;
                const preview = (c.text ?? "").replace(/\s+/g, " ").trim();
                return (
                  <button
                    key={`c-${c.hash}`}
                    type="button"
                    onMouseEnter={() => setActiveIndex(index)}
                    onClick={() => selectHit({ kind: "cast", cast: c })}
                    className={rowClass(active)}
                  >
                    <UserAvatar src={c.author?.pfp_url} alt={author} size="lg" />
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-[var(--foreground)] truncate">
                        {author}
                        {username && (
                          <span className="font-normal text-[var(--muted)]"> @{username}</span>
                        )}
                      </p>
                      <p className="text-xs text-[var(--muted)] line-clamp-2 text-left">
                        {preview || "(no text)"}
                      </p>
                    </div>
                  </button>
                );
              })}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function rowClass(active: boolean): string {
  return `w-full flex items-center gap-3 px-4 py-2.5 text-left transition-colors ${
    active ? "bg-[var(--surface-hover)]" : "hover:bg-[var(--surface-hover)]/70"
  }`;
}

function friendlySearchError(error: unknown): string {
  const raw = error instanceof Error ? error.message : "Search failed";
  if (raw.includes("username proof")) {
    return "No profile found for that query.";
  }
  try {
    const parsed = JSON.parse(raw) as { error?: string; message?: string };
    return parsed.error ?? parsed.message ?? "Search failed. Try again.";
  } catch {
    if (raw.length > 120) return "Search failed. Try again.";
    return raw;
  }
}

function IconSearch({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      fill="none"
      stroke="currentColor"
      viewBox="0 0 24 24"
      aria-hidden
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
      />
    </svg>
  );
}
