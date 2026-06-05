"use client";

import { useEffect, useRef, useState } from "react";
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

interface ProfileSearchModalProps {
  open: boolean;
  onClose: () => void;
}

async function fetchUserSearch(q: string): Promise<SearchUser[]> {
  const res = await fetch(`/api/user/search?q=${encodeURIComponent(q)}`);
  const data = (await res.json()) as { users?: SearchUser[]; error?: string };
  if (!res.ok) throw new Error(data.error ?? "Search failed");
  return data.users ?? [];
}

/** Spotlight-style profile search (username, FID, ETH, X). */
export function ProfileSearchModal({ open, onClose }: ProfileSearchModalProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const openProfilePreview = useUiStore((s) => s.openProfilePreview);

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

  const { data: users = [], isLoading, isFetching, isError, error } = useQuery({
    queryKey: ["profileSearch", debouncedQuery],
    queryFn: () => fetchUserSearch(debouncedQuery),
    enabled: open && debouncedQuery.length > 0,
    staleTime: 30_000,
  });

  useEffect(() => {
    setActiveIndex(0);
  }, [debouncedQuery, users.length]);

  useEffect(() => {
    if (!open) return;
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
        return;
      }
      if (users.length === 0) return;
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setActiveIndex((i) => Math.min(i + 1, users.length - 1));
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setActiveIndex((i) => Math.max(i - 1, 0));
      } else if (e.key === "Enter") {
        e.preventDefault();
        const u = users[activeIndex];
        if (u) selectUser(u);
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, onClose, users, activeIndex]);

  function selectUser(u: SearchUser) {
    const seed = profileSeedFromUnknown(u);
    if (seed) openProfilePreview(seed);
    onClose();
  }

  if (!open) return null;

  const showResults = debouncedQuery.length > 0;
  const pending = showResults && (isLoading || isFetching);

  return (
    <div
      className="fixed inset-0 z-[70] flex items-start justify-center pt-[14vh] px-4 bg-black/55 backdrop-blur-md"
      role="presentation"
      onClick={onClose}
    >
      <div
        className="w-full max-w-xl bg-[var(--surface)] border border-[var(--border)] rounded-2xl shadow-2xl overflow-hidden"
        role="dialog"
        aria-label="Search profiles"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-3 px-4 py-3.5 border-b border-[var(--border)]">
          <IconSearch className="w-5 h-5 text-[var(--muted)] shrink-0" />
          <input
            ref={inputRef}
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Username, FID, ETH address, or X handle…"
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
              Search Farcaster profiles by username, FID, wallet address, or X handle.
            </p>
          )}

          {showResults && pending && users.length === 0 && (
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

          {showResults && !pending && !isError && users.length === 0 && (
            <p className="px-4 py-6 text-sm text-center text-[var(--muted)]">
              No profiles found for &ldquo;{debouncedQuery}&rdquo;
            </p>
          )}

          {users.map((u, index) => {
            const name = u.display_name ?? u.username;
            const active = index === activeIndex;
            return (
              <button
                key={u.fid}
                type="button"
                onMouseEnter={() => setActiveIndex(index)}
                onClick={() => selectUser(u)}
                className={`w-full flex items-center gap-3 px-4 py-2.5 text-left transition-colors ${
                  active
                    ? "bg-[var(--surface-hover)]"
                    : "hover:bg-[var(--surface-hover)]/70"
                }`}
              >
                <UserAvatar src={u.pfp_url} alt={name} size="lg" />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-[var(--foreground)] truncate">
                    {name}
                  </p>
                  <p className="text-xs text-[var(--muted)] truncate">
                    @{u.username}
                    <span className="mx-1.5">·</span>
                    <span className="font-mono">FID {u.fid}</span>
                  </p>
                </div>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
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
