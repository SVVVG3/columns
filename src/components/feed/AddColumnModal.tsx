"use client";

import Image from "next/image";
import { useState, useEffect, useRef, useCallback } from "react";
import { createPortal } from "react-dom";
import {
  channelColumnTitle,
  channelDisplaySlug,
  formatChannelLabel,
  migrateChannelColumnTitle,
} from "@/lib/channelDisplay";
import { UserAvatar } from "@/components/ui/UserAvatar";
import { MAX_COLUMNS, useColumnsStore } from "@/store/columns";
import { rssColumnTitle } from "@/lib/newsArticle";
import type { FeedColumnConfig, FeedColumnType } from "@/types";

type InitialUserChip = {
  id: string;
  label: string;
  fid: number;
  username: string;
  pfpUrl?: string | null;
};

interface AddColumnModalProps {
  onClose: () => void;
  /** When provided, opens modal in edit mode pre-populated from the column config */
  editColumn?: FeedColumnConfig;
  /** Pre-select a column type on open (used when opening from profile "Create column") */
  initialType?: FeedColumnType;
  /** Pre-populate the user chip (only used when initialType === "user") */
  initialUserChip?: InitialUserChip;
}

const COLUMN_TYPES: { type: FeedColumnType; label: string; description: string }[] = [
  { type: "home",     label: "Home",      description: "Casts from people you follow" },
  { type: "trending", label: "Trending",   description: "Popular casts (Hypersnap trending index)" },
  { type: "coindesk", label: "CoinDesk",   description: "Latest crypto news from CoinDesk Data" },
  { type: "rss",      label: "RSS Feed",   description: "Any public RSS or Atom feed URL" },
  { type: "channel",  label: "Channel",    description: "Casts from one or more channels" },
  { type: "user",     label: "User",       description: "Casts from one or more users" },
  { type: "keyword",  label: "Keyword",    description: "Search one topic (scroll for more) or merge several (first page only)" },
];

// ─── Generic chip-based multi-select with async autocomplete ─────────────────
interface MultiSelectProps<T extends { id: string; label: string }> {
  chips: T[];
  onAdd: (item: T) => void;
  onRemove: (id: string) => void;
  fetchSuggestions: (q: string) => Promise<T[]>;
  placeholder: string;
  renderSuggestion?: (item: T) => React.ReactNode;
  /** Min chars before searching (default 2). */
  minSearchLength?: number;
  /** Press Enter with no dropdown match — resolve exact handle (e.g. @user.eth). */
  onEnterResolve?: (q: string) => Promise<T | null>;
  emptyHint?: string;
}

function MultiSelect<T extends { id: string; label: string }>({
  chips,
  onAdd,
  onRemove,
  fetchSuggestions,
  placeholder,
  renderSuggestion,
  minSearchLength = 2,
  onEnterResolve,
  emptyHint,
}: MultiSelectProps<T>) {
  const [input, setInput] = useState("");
  const [suggestions, setSuggestions] = useState<T[]>([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const [searched, setSearched] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [mounted, setMounted] = useState(false);
  const [menuRect, setMenuRect] = useState<{ top: number; left: number; width: number } | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const inputWrapRef = useRef<HTMLDivElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const requestIdRef = useRef(0);

  useEffect(() => setMounted(true), []);

  const updateMenuRect = useCallback(() => {
    const el = inputWrapRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    setMenuRect({ top: rect.bottom + 4, left: rect.left, width: rect.width });
  }, []);

  const search = useCallback(
    async (q: string) => {
      if (q.length < minSearchLength) {
        requestIdRef.current += 1;
        setSuggestions([]);
        setOpen(false);
        setSearched(false);
        setSearchError(null);
        return;
      }
      const reqId = ++requestIdRef.current;
      setLoading(true);
      setOpen(true);
      setSearchError(null);
      updateMenuRect();
      try {
        const results = await fetchSuggestions(q);
        if (reqId !== requestIdRef.current) return;
        setSuggestions(results);
        setSearched(true);
      } catch (err) {
        if (reqId !== requestIdRef.current) return;
        setSuggestions([]);
        setSearched(true);
        setSearchError(err instanceof Error ? err.message : "Search failed");
      } finally {
        if (reqId === requestIdRef.current) setLoading(false);
      }
    },
    [fetchSuggestions, minSearchLength, updateMenuRect]
  );

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => search(input), 300);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [input, search]);

  useEffect(() => {
    if (!open) return;
    updateMenuRect();
    window.addEventListener("resize", updateMenuRect);
    window.addEventListener("scroll", updateMenuRect, true);
    return () => {
      window.removeEventListener("resize", updateMenuRect);
      window.removeEventListener("scroll", updateMenuRect, true);
    };
  }, [open, input, suggestions.length, updateMenuRect]);

  // Close dropdown on outside click (menu is portaled — check both roots)
  useEffect(() => {
    function handler(e: MouseEvent) {
      const t = e.target as Node;
      if (containerRef.current?.contains(t)) return;
      if (menuRef.current?.contains(t)) return;
      setOpen(false);
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  function handleSelect(item: T) {
    if (!chips.find((c) => c.id === item.id)) onAdd(item);
    setInput("");
    setSuggestions([]);
    setOpen(false);
  }

  async function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Backspace" && input === "" && chips.length > 0) {
      onRemove(chips[chips.length - 1].id);
      return;
    }
    if (e.key === "Enter" && input.trim()) {
      e.preventDefault();
      if (suggestions.length > 0) {
        handleSelect(suggestions[0]);
        return;
      }
      if (onEnterResolve) {
        setLoading(true);
        try {
          const item = await onEnterResolve(input.trim());
          if (item) handleSelect(item);
        } finally {
          setLoading(false);
        }
      }
    }
  }

  const dropdown =
    open && menuRect ? (
      <div
        ref={menuRef}
        className="bg-[var(--surface)] border border-[var(--border)] rounded-xl shadow-xl z-[100] max-h-48 overflow-y-auto"
        style={{
          position: "fixed",
          top: menuRect.top,
          left: menuRect.left,
          width: menuRect.width,
        }}
      >
        {loading && suggestions.length === 0 && (
          <p className="px-3 py-2 text-xs text-[var(--muted)]">Searching…</p>
        )}
        {searchError && (
          <p className="px-3 py-2 text-xs text-red-400">{searchError}</p>
        )}
        {!loading && searched && suggestions.length === 0 && !searchError && (
          <p className="px-3 py-2 text-xs text-[var(--muted)]">
            {emptyHint ?? "No matches. Press Enter to look up an exact username."}
          </p>
        )}
        {suggestions.map((item) => (
          <button
            key={item.id}
            type="button"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => handleSelect(item)}
            className="w-full text-left px-3 py-2 text-sm hover:bg-[var(--surface-hover)] transition-colors first:rounded-t-xl last:rounded-b-xl"
          >
            {renderSuggestion ? renderSuggestion(item) : (
              <span className="text-[var(--foreground)]">{item.label}</span>
            )}
          </button>
        ))}
      </div>
    ) : null;

  return (
    <div ref={containerRef} className="relative">
      {/* Chips + input */}
      <div
        ref={inputWrapRef}
        className="flex flex-wrap gap-1.5 bg-[var(--surface-hover)] border border-[var(--border)] rounded-lg px-2 py-1.5 focus-within:border-[var(--accent)] transition-colors min-h-[38px] max-h-36 overflow-y-auto"
      >
        {chips.map((c) => (
          <span
            key={c.id}
            className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-[var(--accent)]/20 text-[var(--accent)] text-xs font-medium"
          >
            {c.label}
            <button
              type="button"
              onClick={() => onRemove(c.id)}
              className="hover:text-white transition-colors"
            >
              ×
            </button>
          </span>
        ))}
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={chips.length === 0 ? placeholder : ""}
          className="flex-1 min-w-[80px] bg-transparent text-sm text-[var(--foreground)] placeholder:text-[var(--muted)] outline-none"
        />
        {loading && (
          <span className="text-[var(--muted)] text-xs self-center">…</span>
        )}
      </div>

      {mounted && dropdown ? createPortal(dropdown, document.body) : null}
    </div>
  );
}

// ─── Keyword tag input (no async, just Enter/comma to add) ───────────────────
function KeywordInput({
  tags,
  onAdd,
  onRemove,
}: {
  tags: string[];
  onAdd: (tag: string) => void;
  onRemove: (tag: string) => void;
}) {
  const [input, setInput] = useState("");

  function commit() {
    const trimmed = input.trim();
    if (trimmed && !tags.includes(trimmed)) onAdd(trimmed);
    setInput("");
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter" || e.key === ",") {
      e.preventDefault();
      commit();
    }
    if (e.key === "Backspace" && input === "" && tags.length > 0) {
      onRemove(tags[tags.length - 1]);
    }
  }

  return (
    <div className="flex flex-wrap gap-1.5 bg-[var(--surface-hover)] border border-[var(--border)] rounded-lg px-2 py-1.5 focus-within:border-[var(--accent)] transition-colors min-h-[38px] max-h-36 overflow-y-auto">
      {tags.map((t) => (
        <span
          key={t}
          className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-[var(--accent)]/20 text-[var(--accent)] text-xs font-medium"
        >
          {t}
          <button type="button" onClick={() => onRemove(t)} className="hover:text-white transition-colors">
            ×
          </button>
        </span>
      ))}
      <input
        value={input}
        onChange={(e) => setInput(e.target.value)}
        onKeyDown={handleKeyDown}
        onBlur={commit}
        placeholder={tags.length === 0 ? "Type a keyword, press Enter or comma to add" : ""}
        className="flex-1 min-w-[120px] bg-transparent text-sm text-[var(--foreground)] placeholder:text-[var(--muted)] outline-none"
      />
    </div>
  );
}

// ─── Modal ───────────────────────────────────────────────────────────────────
export function AddColumnModal({ onClose, editColumn, initialType, initialUserChip }: AddColumnModalProps) {
  const { addColumn, updateColumn, columns } = useColumnsStore();
  const isEditMode = !!editColumn;
  const atColumnLimit = !isEditMode && columns.length >= MAX_COLUMNS;

  const bodyRef = useRef<HTMLDivElement>(null);

  // Scroll the body to reveal the input section when a type with an input is selected.
  // Uses requestAnimationFrame so the input section has rendered before we measure.

  // Initialise state from editColumn/initialType if provided
  const [selectedType, setSelectedType] = useState<FeedColumnType | null>(
    editColumn?.type ?? initialType ?? null
  );

  type ChannelChip = {
    id: string;
    label: string;
    name: string;
    displaySlug: string;
    image_url?: string | null;
    member_count?: number;
  };

  // Channel multi-select — pre-fill from existing channelIds
  const [channelChips, setChannelChips] = useState<ChannelChip[]>(() =>
    (editColumn?.channelIds ?? []).map((id) => ({
      id,
      label: formatChannelLabel(id),
      name: id,
      displaySlug: channelDisplaySlug(id),
    }))
  );
  // User multi-select — pre-fill from existing targetFids (initially show FIDs, then resolve)
  // or from initialUserChip when opened from a profile card.
  const [userChips, setUserChips] = useState<{ id: string; label: string; fid: number; username: string; pfpUrl?: string | null }[]>(
    () => {
      if (initialUserChip && !editColumn) return [initialUserChip];
      return (editColumn?.targetFids ?? []).map((fid) => ({ id: String(fid), label: `@${fid}`, fid, username: String(fid) }));
    }
  );

  // Resolve FIDs → usernames when opening in edit mode
  useEffect(() => {
    const fids = editColumn?.targetFids;
    if (!fids || fids.length === 0) return;
    fetch(`/api/user/bulk?fids=${fids.join(",")}`)
      .then((r) => r.json())
      .then((data: { users?: { fid: number; username: string; display_name?: string; pfp_url?: string }[] }) => {
        if (!data.users) return;
        const byFid = new Map(data.users.map((u) => [u.fid, u]));
        setUserChips((prev) =>
          prev.map((chip) => {
            const u = byFid.get(chip.fid);
            if (!u) return chip;
            return { ...chip, label: `@${u.username}`, username: u.username, pfpUrl: u.pfp_url ?? null };
          })
        );
      })
      .catch(() => {});
  // Only run once on mount
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  // Keyword tags — pre-fill from existing queries
  const [keywordTags, setKeywordTags] = useState<string[]>(editColumn?.queries ?? []);
  const [rssUrl, setRssUrl] = useState(editColumn?.rssUrl ?? "");

  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose]);

  // Scroll the modal body to reveal the input section when a type requiring
  // input is selected (channel, user, rss, keyword all show a field below the list).
  useEffect(() => {
    if (!selectedType) return;
    const hasInputSection = ["channel", "user", "rss", "keyword"].includes(selectedType);
    if (!hasInputSection) return;
    requestAnimationFrame(() => {
      if (bodyRef.current) {
        bodyRef.current.scrollTo({ top: bodyRef.current.scrollHeight, behavior: "smooth" });
      }
    });
  }, [selectedType]);

  function mapChannelChip(ch: {
    id: string;
    displaySlug: string;
    name: string;
    image_url?: string | null;
    member_count?: number;
  }): ChannelChip {
    return {
      id: ch.id,
      displaySlug: ch.displaySlug,
      label: formatChannelLabel(ch.id, ch.displaySlug),
      name: ch.name,
      image_url: ch.image_url ?? null,
      member_count: ch.member_count ?? 0,
    };
  }

  const fetchChannels = useCallback(async (q: string): Promise<ChannelChip[]> => {
    const res = await fetch(`/api/channel/search?q=${encodeURIComponent(q)}`);
    const data = await res.json();
    if (!res.ok) {
      throw new Error(data?.error ?? "Channel search failed");
    }
    return (data.channels ?? []).map(mapChannelChip);
  }, []);

  async function resolveChannelOnEnter(q: string) {
    const trimmed = q.replace(/^[#/]+/, "").trim();
    if (!trimmed) return null;

    const existing = channelChips.find(
      (c) =>
        c.id.toLowerCase() === trimmed.toLowerCase() ||
        c.displaySlug.toLowerCase() === trimmed.toLowerCase()
    );
    if (existing) return existing;

    const fromSearch = await fetchChannels(trimmed);
    const exact = fromSearch.find(
      (c) => c.displaySlug.toLowerCase() === trimmed.toLowerCase()
    );
    if (exact) return exact;
    if (fromSearch.length === 1) return fromSearch[0];

    const res = await fetch(`/api/channel/lookup?q=${encodeURIComponent(trimmed)}`);
    const data = (await res.json()) as {
      channel?: {
        id: string;
        displaySlug: string;
        name: string;
        image_url?: string | null;
        member_count?: number;
      };
      error?: string;
    };
    if (!res.ok || !data.channel) return null;
    return mapChannelChip(data.channel);
  }

  function mapUser(u: {
    fid: number;
    username: string;
    display_name?: string;
    pfp_url?: string;
  }) {
    return {
      id: String(u.fid),
      label: `@${u.username}`,
      fid: u.fid,
      username: u.username,
      displayName: u.display_name ?? u.username,
      pfpUrl: u.pfp_url ?? null,
    };
  }

  const fetchUsers = useCallback(async (q: string): Promise<ReturnType<typeof mapUser>[]> => {
    const res = await fetch(`/api/user/search?q=${encodeURIComponent(q)}`);
    const data = (await res.json()) as {
      users?: { fid: number; username: string; display_name?: string; pfp_url?: string }[];
      error?: string;
    };
    if (!res.ok) {
      throw new Error(data?.error ?? "User search failed");
    }
    return (data.users ?? []).map(mapUser);
  }, []);

  async function resolveUserOnEnter(q: string) {
    const results = await fetchUsers(q);
    const needle = q.replace(/^@/, "").trim().toLowerCase();
    const exact = results.find((u) => u.username.toLowerCase() === needle);
    if (exact) return exact;
    if (results.length === 1) return results[0];
    return results[0] ?? null;
  }

  function buildColumn(): FeedColumnConfig | null {
    if (!selectedType) return null;
    // Preserve ID when editing, generate new one when adding
    const id = editColumn?.id ?? `${selectedType}-${Date.now()}`;
    const base = { id, type: selectedType, refreshInterval: 60_000 };

    switch (selectedType) {
      case "home":    return { ...base, title: "Home" };
      case "trending":return { ...base, title: "Trending" };
      case "coindesk": return { ...base, title: "CoinDesk News" };
      case "rss": {
        const url = rssUrl.trim();
        if (!isValidRssUrl(url)) return null;
        return { ...base, title: rssColumnTitle(url), rssUrl: url };
      }
      case "channel": {
        if (channelChips.length === 0) return null;
        const ids = channelChips.map((c) => c.id);
        const title = channelColumnTitle(ids);
        return { ...base, title, channelIds: ids };
      }
      case "user": {
        if (userChips.length === 0) return null;
        const fids = userChips.map((u) => u.fid);
        const title = userChips.length === 1 ? `@${userChips[0].username}` : `${userChips.length} users`;
        return { ...base, title, targetFids: fids };
      }
      case "keyword": {
        if (keywordTags.length === 0) return null;
        const title = keywordTags.length === 1 ? keywordTags[0] : `${keywordTags.length} keywords`;
        return { ...base, title, queries: keywordTags };
      }
    }
  }

  function handleSave() {
    const column = buildColumn();
    if (!column) return;
    if (isEditMode && editColumn) {
      updateColumn(editColumn.id, {
        type: column.type,
        channelIds: column.channelIds,
        targetFids: column.targetFids,
        queries: column.queries,
        rssUrl: column.rssUrl,
        // Always preserve the user's custom title — only use the auto-generated
        // title if the column never had one (shouldn't happen in practice)
        title: migrateChannelColumnTitle({
          type: column.type,
          title: editColumn.title || column.title,
          channelIds: column.channelIds,
        }),
      });
    } else {
      if (!addColumn(column)) return;
    }
    onClose();
  }

  const canSave = buildColumn() !== null && !atColumnLimit;

  return (
    <div
      className="fixed inset-0 z-[95] flex items-start justify-center pt-16 bg-black/70 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="w-full max-w-sm bg-[var(--surface)] border border-[var(--border)] rounded-2xl shadow-2xl flex flex-col max-h-[85vh]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header — sticky */}
        <div className="flex items-center justify-between px-4 pt-4 pb-3 border-b border-[var(--border)] shrink-0">
          <h2 className="text-sm font-semibold text-[var(--foreground)]">
            {isEditMode ? "Edit Column" : "Add Column"}
          </h2>
          <button onClick={onClose} className="text-[var(--muted)] hover:text-[var(--foreground)] transition-colors">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {atColumnLimit && (
          <p className="px-4 py-2 text-xs text-amber-200/90 border-b border-[var(--border)] bg-amber-500/10">
            You&apos;ve reached the maximum of {MAX_COLUMNS} columns. Remove one to add another.
          </p>
        )}

        {/* Scrollable body */}
        <div ref={bodyRef} className="overflow-y-auto flex-1 min-h-0">
          {/* Type picker */}
          <div className="p-3 space-y-1.5">
            {COLUMN_TYPES.map(({ type, label, description }) => (
              <button
                key={type}
                onClick={() => setSelectedType(type === selectedType ? null : type)}
                className={`w-full text-left px-3 py-2.5 rounded-xl border transition-colors ${
                  selectedType === type
                    ? "border-[var(--accent)] bg-[var(--accent)]/10"
                    : "border-[var(--border)] hover:border-[var(--muted)]"
                }`}
              >
                <p className="text-sm font-medium text-[var(--foreground)]">{label}</p>
                <p className="text-xs text-[var(--muted)] mt-0.5">{description}</p>
              </button>
            ))}
          </div>

          {/* Channel multi-select */}
          {selectedType === "channel" && (
            <div className="px-3 pb-3 space-y-1.5">
              <label className="text-xs font-medium text-[var(--muted)] uppercase tracking-wide">Channels</label>
              <MultiSelect
                chips={channelChips}
                onAdd={(item) => setChannelChips((prev) => [...prev, item as ChannelChip])}
                onRemove={(id) => setChannelChips((prev) => prev.filter((c) => c.id !== id))}
                fetchSuggestions={fetchChannels}
                onEnterResolve={resolveChannelOnEnter}
                placeholder="Search channels…"
                emptyHint="No matches yet. Press Enter to look up an exact channel slug (e.g. basepaint)."
                renderSuggestion={(item) => {
                  const ch = item as ChannelChip;
                  const displayName = ch.name?.trim();
                  const showDisplayName =
                    !!displayName &&
                    displayName.toLowerCase() !== ch.displaySlug.toLowerCase();
                  return (
                    <span className="flex items-center gap-2">
                      {ch.image_url ? (
                        <Image src={ch.image_url} alt="" width={20} height={20} className="w-5 h-5 rounded-full object-cover shrink-0" unoptimized />
                      ) : (
                        <span className="w-5 h-5 rounded-full bg-[var(--surface-hover)] shrink-0 flex items-center justify-center text-[8px] text-[var(--muted)]">/</span>
                      )}
                      <span className="text-[var(--foreground)] font-medium">{ch.label}</span>
                      {showDisplayName ? (
                        <span className="text-[var(--muted)] text-xs">{displayName}</span>
                      ) : ch.member_count ? (
                        <span className="text-[var(--muted)] text-xs">{ch.member_count} members</span>
                      ) : null}
                    </span>
                  );
                }}
              />
            </div>
          )}

          {/* User multi-select */}
          {selectedType === "user" && (
            <div className="px-3 pb-3 space-y-1.5">
              <label className="text-xs font-medium text-[var(--muted)] uppercase tracking-wide">Users</label>
              <MultiSelect
                chips={userChips}
                onAdd={(item) => setUserChips((prev) => [...prev, item as typeof userChips[number]])}
                onRemove={(id) => setUserChips((prev) => prev.filter((u) => u.id !== id))}
                fetchSuggestions={fetchUsers}
                onEnterResolve={resolveUserOnEnter}
                placeholder="Search @username or name.eth…"
                emptyHint="No matches yet. Press Enter to look up an exact @username or name.eth."
                renderSuggestion={(item) => {
                  const u = item as { username: string; displayName?: string; pfpUrl?: string | null };
                  return (
                    <span className="flex items-center gap-2">
                      <UserAvatar src={u.pfpUrl} alt={u.username} size="sm" />
                      <span className="text-[var(--foreground)] font-medium">@{u.username}</span>
                      <span className="text-[var(--muted)] text-xs">{u.displayName}</span>
                    </span>
                  );
                }}
              />
            </div>
          )}

          {/* RSS feed URL */}
          {selectedType === "rss" && (
            <div className="px-3 pb-3 space-y-1.5">
              <label className="text-xs font-medium text-[var(--muted)] uppercase tracking-wide">
                Feed URL
              </label>
              <p className="text-[11px] text-[var(--muted)] leading-snug">
                Paste an RSS or Atom URL — e.g. a blog, newsletter, or podcast feed.
              </p>
              <input
                type="url"
                value={rssUrl}
                onChange={(e) => setRssUrl(e.target.value)}
                placeholder="https://example.com/feed.xml"
                className="w-full px-3 py-2 rounded-xl border border-[var(--border)] bg-[var(--background)] text-sm text-[var(--foreground)] placeholder:text-[var(--muted)] outline-none focus:border-[var(--accent)]"
                spellCheck={false}
              />
              {rssUrl.trim() && !isValidRssUrl(rssUrl.trim()) && (
                <p className="text-[11px] text-red-400">Enter a valid http(s) feed URL.</p>
              )}
            </div>
          )}

          {/* Keyword tags */}
          {selectedType === "keyword" && (
            <div className="px-3 pb-3 space-y-1.5">
              <label className="text-xs font-medium text-[var(--muted)] uppercase tracking-wide">Keywords</label>
              <p className="text-[11px] text-[var(--muted)] leading-snug">
                One keyword supports load more. With two or more, Columns shows a single merged first page.
              </p>
              <KeywordInput
                tags={keywordTags}
                onAdd={(t) => setKeywordTags((prev) => [...prev, t])}
                onRemove={(t) => setKeywordTags((prev) => prev.filter((k) => k !== t))}
              />
            </div>
          )}
        </div>

        {/* Save / Add button — sticky footer */}
        <div className="px-3 pb-3 pt-2 border-t border-[var(--border)] shrink-0">
          <button
            onClick={handleSave}
            disabled={!canSave}
            className="w-full py-2 rounded-xl bg-[var(--accent)] hover:bg-[var(--accent-hover)] disabled:opacity-40 disabled:cursor-not-allowed text-white text-sm font-medium transition-colors"
          >
            {isEditMode ? "Save Changes" : "Add Column"}
          </button>
        </div>
      </div>
    </div>
  );
}

function isValidRssUrl(raw: string): boolean {
  try {
    const url = new URL(raw.trim());
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}
