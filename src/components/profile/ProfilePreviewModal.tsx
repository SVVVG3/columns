"use client";

import Image from "next/image";
import { useEffect, useState } from "react";
import { AddColumnModal } from "@/components/feed/AddColumnModal";
import { UserAvatar } from "@/components/ui/UserAvatar";
import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import {
  channelColumnFromSlug,
  columnHasChannel,
} from "@/lib/channelColumn";
import {
  farcasterProfileUrl,
  formatProfileCount,
  formatProfileJoinedDate,
  type ProfileDetails,
  type ProfilePreviewSeed,
} from "@/lib/profilePreview";
import type { FollowRelationship } from "@/lib/followCheck";
import { renderLinkifiedText } from "@/lib/linkifyText";
import { profileFollowStatusLines } from "@/lib/profileFollowLabels";
import {
  getUserFeedColumns,
  userColumnHasFid,
  userColumnTargetFids,
} from "@/lib/userColumn";
import { CastCard } from "@/components/cast/CastCard";
import { ColumnsBadge } from "@/components/profile/ColumnsBadge";
import {
  ProfileMetaLinksRow,
  ProfileWalletsDropdown,
} from "@/components/profile/profileMeta";
import { Top8Section } from "@/components/profile/Top8Section";
import { MAX_FEED_CURSOR_BYTES } from "@/lib/feedPagination";
import { useColumnsStore } from "@/store/columns";
import { useUiStore } from "@/store/ui";
import type { FeedColumnConfig } from "@/types";

async function fetchFollowRelationship(fid: number): Promise<FollowRelationship> {
  const res = await fetch(`/api/user/follow-relationship?fid=${fid}`);
  if (!res.ok) throw new Error("Failed to load follow relationship");
  return res.json() as Promise<FollowRelationship>;
}

async function fetchProfile(seed: ProfilePreviewSeed): Promise<ProfileDetails> {
  const params = new URLSearchParams();
  if (seed.fid != null) params.set("fid", String(seed.fid));
  else if (seed.username) params.set("username", seed.username);
  const res = await fetch(`/api/user/profile?${params}`);
  if (!res.ok) throw new Error("Failed to load profile");
  const data = (await res.json()) as { user: ProfileDetails };
  return data.user;
}

interface UserCastsPage {
  casts?: Record<string, unknown>[];
  next?: { cursor?: string | null };
}

function ModalCloseButton({
  onClose,
  onBanner,
}: {
  onClose: () => void;
  onBanner?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClose}
      className={
        onBanner
          ? "absolute top-2 right-2 z-10 text-white/90 hover:text-white transition-colors p-1.5 rounded-lg hover:bg-black/25"
          : "text-[var(--muted)] hover:text-[var(--foreground)] transition-colors p-1"
      }
      aria-label="Close"
    >
      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
      </svg>
    </button>
  );
}

interface ProfilePreviewModalProps {
  viewerFid: number;
}

export function ProfilePreviewModal({ viewerFid }: ProfilePreviewModalProps) {
  const profileStack = useUiStore((s) => s.profilePreviewStack);
  const seed = profileStack[profileStack.length - 1] ?? null;
  const closeProfilePreview = useUiStore((s) => s.closeProfilePreview);
  const openProfilePreview = useUiStore((s) => s.openProfilePreview);
  const conversationOpen = useUiStore((s) => s.selectedCastHash != null);
  const overlayFocus = useUiStore((s) => s.overlayFocus);
  const columns = useColumnsStore((s) => s.columns);
  const addColumn = useColumnsStore((s) => s.addColumn);
  const [showAddColumn, setShowAddColumn] = useState(false);

  const { data: profile, isLoading, isError } = useQuery<ProfileDetails>({
    queryKey: ["profile", "v4", seed?.fid, seed?.username],
    queryFn: () => fetchProfile(seed!),
    enabled: !!seed,
    staleTime: 60_000,
  });

  const targetFid = profile?.fid ?? seed?.fid;
  const showFollowStatus =
    targetFid != null && targetFid !== viewerFid;

  const { data: followRel, isLoading: followLoading } = useQuery({
    queryKey: ["follow-relationship", viewerFid, targetFid],
    queryFn: () => fetchFollowRelationship(targetFid!),
    enabled: !!showFollowStatus,
    staleTime: 60_000,
  });

  const {
    data: userCastsPages,
    isLoading: userCastsLoading,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
  } = useInfiniteQuery({
    queryKey: ["profile-user-casts", targetFid],
    queryFn: async ({ pageParam }) => {
      let cursor = pageParam as string | undefined;
      if (cursor && cursor.length > MAX_FEED_CURSOR_BYTES) cursor = undefined;
      const params = new URLSearchParams({ fid: String(targetFid), limit: "25" });
      if (cursor) params.set("cursor", cursor);
      const res = await fetch(`/api/feed/user?${params}`);
      if (!res.ok) throw new Error("Failed to load casts");
      return (await res.json()) as UserCastsPage;
    },
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (lastPage, allPages) => {
      const cursor = lastPage.next?.cursor;
      if (!cursor) return undefined;
      const lastCasts = (lastPage.casts ?? []) as { hash?: string }[];
      if (lastCasts.length === 0) return undefined;
      const priorHashes = new Set(
        allPages
          .slice(0, -1)
          .flatMap((p) => ((p.casts ?? []) as { hash?: string }[]).map((c) => c.hash))
          .filter(Boolean)
      );
      const newCount = lastCasts.filter((c) => c.hash && !priorHashes.has(c.hash)).length;
      if (newCount === 0) return undefined;
      return cursor;
    },
    enabled: targetFid != null && !!profile,
    staleTime: 120_000,
  });

  const userCasts =
    userCastsPages?.pages.flatMap((p) => p.casts ?? []) ?? [];

  const { data: columnsBadge } = useQuery({
    queryKey: ["columns-user", targetFid],
    queryFn: async () => {
      const res = await fetch(`/api/columns-user?fid=${targetFid}`);
      if (!res.ok) return { isColumnsUser: false, showBadge: false };
      return res.json() as Promise<{ isColumnsUser: boolean; showBadge: boolean }>;
    },
    enabled: targetFid != null,
    staleTime: 300_000,
  });

  useEffect(() => {
    if (!seed) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      const { reactionActors, overlayFocus: focus, selectedCastHash } = useUiStore.getState();
      if (reactionActors) return;
      if (selectedCastHash && focus !== "profile") return;
      closeProfilePreview();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [seed, closeProfilePreview]);

  if (!seed) return null;

  const displayName = profile?.displayName ?? seed.displayName ?? seed.username;
  const username = profile?.username ?? seed.username;
  const pfpUrl = profile?.pfpUrl ?? seed.pfpUrl;
  const profileUrl = farcasterProfileUrl(username);
  const fid = profile?.fid ?? seed.fid;
  const joined = formatProfileJoinedDate(profile?.registeredAt);
  const followers = formatProfileCount(profile?.followerCount);
  const following = formatProfileCount(profile?.followingCount);
  const bio = profile?.bio;
  const bannerUrl = profile?.bannerUrl;
  const wallets = profile?.wallets ?? [];
  const profileLinks = profile?.profileLinks ?? [];
  const followLines =
    followRel && username
      ? profileFollowStatusLines(username, followRel)
      : [];

  function handleChannelClick(channelId: string) {
    if (!columnHasChannel(columns, channelId)) {
      addColumn(channelColumnFromSlug(channelId));
    }
    closeProfilePreview();
  }

  const bothOpen = conversationOpen;
  const profileOnTop = !bothOpen || overlayFocus === "profile";

  return (
    <>
    <div
      className={`fixed inset-0 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm transition-[filter,opacity] duration-200 ${
        profileOnTop ? "z-[90]" : "z-[80]"
      } ${bothOpen && !profileOnTop ? "pointer-events-none" : ""}`}
      onClick={profileOnTop ? closeProfilePreview : undefined}
      role="presentation"
      aria-hidden={bothOpen && !profileOnTop}
    >
      <div
        className={`w-full max-w-lg max-h-[min(92vh,720px)] flex flex-col bg-[var(--surface)] border border-[var(--border)] rounded-2xl shadow-2xl overflow-hidden transition-all duration-200 ${
          bothOpen && !profileOnTop ? "blur-md opacity-40 scale-[0.98]" : ""
        }`}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-label={`Profile: ${displayName}`}
      >
        {bannerUrl ? (
          <div className="relative w-full aspect-[3/1] bg-[var(--surface-hover)] shrink-0">
            <Image
              src={bannerUrl}
              alt=""
              fill
              className="object-cover"
              unoptimized
            />
            <ModalCloseButton onClose={closeProfilePreview} onBanner />
          </div>
        ) : (
          <div className="flex justify-end px-3 pt-3 pb-0">
            <ModalCloseButton onClose={closeProfilePreview} />
          </div>
        )}

        <div className="flex-1 min-h-0 overflow-y-auto feed-scroll px-4 pb-3">
          <div className="flex flex-col items-center pt-3 w-full">
            <div className="flex justify-center w-full">
              <div className="flex items-start gap-4 max-w-full">
              <UserAvatar src={pfpUrl} alt={displayName} size="xl" className="shrink-0" />
              <div className="min-w-0 pt-0.5 text-left">
                <div className="flex items-center gap-2 min-w-0">
                  <p className="text-base font-semibold text-[var(--foreground)] leading-tight truncate">
                    {displayName}
                  </p>
                  {columnsBadge?.showBadge && <ColumnsBadge />}
                </div>
                <p className="text-sm text-[var(--muted)] truncate">@{username}</p>
                {wallets.length > 0 ? (
                  <ProfileWalletsDropdown wallets={wallets} fid={fid} />
                ) : fid != null ? (
                  <p className="text-[10px] text-[var(--muted)] font-mono mt-1">FID {fid}</p>
                ) : null}
              </div>
              </div>
            </div>

            {isLoading && !profile && (
              <div className="w-full max-w-sm mt-3 space-y-1.5 animate-pulse">
                <div className="h-2 rounded bg-[var(--surface-hover)] w-full" />
                <div className="h-2 rounded bg-[var(--surface-hover)] w-4/5 mx-auto" />
              </div>
            )}

            {bio ? (
              <p className="text-xs text-[var(--foreground)] opacity-90 mt-3 leading-relaxed whitespace-pre-wrap break-words w-full max-w-sm text-center text-pretty">
                {renderLinkifiedText(bio, {
                  onMentionClick: (mentionUsername) =>
                    openProfilePreview({ username: mentionUsername }),
                  onChannelClick: handleChannelClick,
                })}
              </p>
            ) : null}

            {(followers != null || following != null) && (
              <p className="text-xs text-[var(--muted)] mt-2 text-center">
                {followers != null && <span>{followers} followers</span>}
                {followers != null && following != null && <span> · </span>}
                {following != null && <span>{following} following</span>}
              </p>
            )}

            {showFollowStatus && followLoading && (
              <div className="w-32 h-3 mt-2 rounded bg-[var(--surface-hover)] animate-pulse" />
            )}

            {followLines.length > 0 && (
              <div className="mt-2 flex flex-col gap-0.5 w-full max-w-sm items-center">
                {followLines.map((line) => (
                  <p
                    key={line}
                    className="text-xs font-medium text-[var(--accent)]"
                  >
                    {line}
                  </p>
                ))}
              </div>
            )}

            {(profileLinks.length > 0 || joined) && (
              <ProfileMetaLinksRow links={profileLinks} joined={joined} align="center" />
            )}

            {targetFid != null && (
              <Top8Section
                ownerFid={targetFid}
                isOwnProfile={targetFid === viewerFid}
              />
            )}

            {isError && (
              <p className="text-xs text-[var(--muted)] mt-3">Couldn&apos;t load full profile details.</p>
            )}

            {targetFid != null && (
              <div className="mt-4 w-full border-t border-[var(--border)] pt-3 text-left">
                <p className="text-[10px] font-semibold uppercase tracking-wide text-[var(--muted)] mb-2 text-center">
                  Casts
                </p>
                {userCastsLoading && (
                  <div className="space-y-3 animate-pulse">
                    {[...Array(2)].map((_, i) => (
                      <div key={i} className="h-24 rounded-xl bg-[var(--surface-hover)]" />
                    ))}
                  </div>
                )}
                {!userCastsLoading && userCasts.length === 0 && (
                  <p className="text-xs text-center text-[var(--muted)]">No casts yet.</p>
                )}
                <ul className="space-y-0">
                  {userCasts.map((cast) => {
                    const hash = cast.hash as string;
                    if (!hash) return null;
                    return (
                      <li key={hash}>
                        <CastCard cast={cast} viewerFid={viewerFid} variant="feed" />
                      </li>
                    );
                  })}
                </ul>
                {hasNextPage && (
                  <button
                    type="button"
                    onClick={() => void fetchNextPage()}
                    disabled={isFetchingNextPage}
                    className="mt-3 w-full py-2 rounded-xl border border-[var(--border)] text-xs font-medium text-[var(--foreground)] hover:bg-[var(--surface-hover)] disabled:opacity-50 transition-colors"
                  >
                    {isFetchingNextPage ? "Loading…" : "Load more"}
                  </button>
                )}
              </div>
            )}
          </div>
        </div>

        <div className="shrink-0 flex gap-2 px-4 pb-4 border-t border-[var(--border)] pt-3 bg-[var(--surface)]">
          <ProfileAddToColumnControl
            fid={fid}
            username={username}
            pfpUrl={pfpUrl}
            userColumns={getUserFeedColumns(columns)}
            onCreateNew={() => setShowAddColumn(true)}
          />
          {profileUrl && (
            <a
              href={profileUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex-1 py-2 rounded-xl bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-white text-sm font-medium text-center transition-colors"
            >
              View on Farcaster
            </a>
          )}
        </div>
      </div>
    </div>

    {showAddColumn && fid != null && (
      <AddColumnModal
        onClose={() => setShowAddColumn(false)}
        initialType="user"
        initialUserChip={{
          id: String(fid),
          label: `@${username}`,
          fid,
          username,
          pfpUrl,
        }}
      />
    )}
    </>
  );
}

function ProfileAddToColumnControl({
  fid,
  username,
  pfpUrl,
  userColumns,
  onCreateNew,
}: {
  fid?: number;
  username: string;
  pfpUrl?: string | null;
  userColumns: FeedColumnConfig[];
  onCreateNew?: () => void;
}) {
  void pfpUrl; // passed through to AddColumnModal via parent — kept here for prop-drilling clarity
  const updateColumn = useColumnsStore((s) => s.updateColumn);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    setMessage(null);
  }, [fid, username]);

  function addToColumn(column: FeedColumnConfig) {
    if (fid == null) return;
    const next = [...userColumnTargetFids(column), fid];
    updateColumn(column.id, { targetFids: next, targetFid: undefined });
    setMessage(`Added to ${column.title}`);
  }

  function removeFromColumn(column: FeedColumnConfig) {
    if (fid == null) return;
    const next = userColumnTargetFids(column).filter((f) => f !== fid);
    updateColumn(column.id, { targetFids: next, targetFid: undefined });
    setMessage(`Removed from ${column.title}`);
  }

  // No existing user columns — show "Create User column" if handler provided, else disabled hint.
  if (userColumns.length === 0) {
    if (onCreateNew) {
      return (
        <button
          type="button"
          onClick={onCreateNew}
          className="flex-1 py-2 rounded-xl border border-[var(--border)] text-sm font-medium text-[var(--foreground)] hover:bg-[var(--surface-hover)] transition-colors"
        >
          Create User column
        </button>
      );
    }
    return (
      <button
        type="button"
        disabled
        title="Create a User column from the sidebar first"
        className="flex-1 py-2 rounded-xl border border-[var(--border)] text-sm font-medium text-[var(--muted)] opacity-50 cursor-not-allowed"
      >
        Add to column
      </button>
    );
  }

  // Single column without "create new" option — simple toggle button.
  if (userColumns.length === 1 && !onCreateNew) {
    const col = userColumns[0]!;
    const already = fid != null && userColumnHasFid(col, fid);
    const disabled = fid == null;
    return (
      <button
        type="button"
        disabled={disabled}
        onClick={() => already ? removeFromColumn(col) : addToColumn(col)}
        className={`flex-1 py-2 rounded-xl border text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${
          already
            ? "border-[var(--border)] text-[var(--muted)] hover:text-red-400 hover:border-red-400/50 hover:bg-red-400/5"
            : "border-[var(--border)] text-[var(--foreground)] hover:bg-[var(--surface-hover)]"
        }`}
      >
        {message ?? (already ? "Remove from column" : "Add to column")}
      </button>
    );
  }

  // Multi-column dropdown (or single column + "New column…" option).
  const disabled = fid == null;
  return (
    <details className="group flex-1 relative text-left">
      <summary
        className={`py-2 rounded-xl border border-[var(--border)] text-sm font-medium text-center list-none cursor-pointer transition-colors [&::-webkit-details-marker]:hidden ${
          disabled
            ? "opacity-50 cursor-not-allowed pointer-events-none text-[var(--muted)]"
            : "text-[var(--foreground)] hover:bg-[var(--surface-hover)]"
        }`}
      >
        {message ?? "Add to column"}
      </summary>
      <ul className="absolute bottom-full left-0 right-0 mb-1.5 rounded-xl border border-[var(--border)] bg-[var(--surface)] shadow-xl overflow-hidden z-10 max-h-48 overflow-y-auto feed-scroll">
        {userColumns.map((col) => {
          const already = fid != null && userColumnHasFid(col, fid);
          return (
            <li key={col.id}>
              <button
                type="button"
                onClick={() => already ? removeFromColumn(col) : addToColumn(col)}
                className={`w-full px-3 py-2.5 text-left text-sm transition-colors ${
                  already
                    ? "hover:bg-red-400/10 group/item"
                    : "hover:bg-[var(--surface-hover)]"
                }`}
              >
                <span className="font-medium text-[var(--foreground)]">{col.title}</span>
                <span className={`block text-[10px] ${already ? "text-[var(--recast)] group-hover/item:text-red-400" : "text-[var(--muted)]"}`}>
                  {already ? "✓ Added — click to remove" : "Click to add"}
                </span>
              </button>
            </li>
          );
        })}
        {onCreateNew && (
          <li className="border-t border-[var(--border)]">
            <button
              type="button"
              onClick={onCreateNew}
              className="w-full px-3 py-2.5 text-left text-sm text-[var(--accent)] hover:bg-[var(--surface-hover)] transition-colors"
            >
              + New column…
            </button>
          </li>
        )}
      </ul>
    </details>
  );
}

