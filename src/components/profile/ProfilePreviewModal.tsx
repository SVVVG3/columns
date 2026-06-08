"use client";

import Image from "next/image";
import { useEffect, useState } from "react";
import { UserAvatar } from "@/components/ui/UserAvatar";
import { useQuery } from "@tanstack/react-query";
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

async function fetchPopularCasts(fid: number): Promise<Record<string, unknown>[]> {
  const res = await fetch(`/api/user/popular-casts?fid=${fid}&limit=3`);
  if (!res.ok) throw new Error("Failed to load popular casts");
  const data = (await res.json()) as { casts?: Record<string, unknown>[] };
  return data.casts ?? [];
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

  const { data: popularCasts = [], isLoading: popularLoading } = useQuery({
    queryKey: ["popular-casts", targetFid],
    queryFn: () => fetchPopularCasts(targetFid!),
    enabled: targetFid != null && !!profile,
    staleTime: 120_000,
  });

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
                  Top Recent Casts
                </p>
                {popularLoading && (
                  <div className="space-y-3 animate-pulse">
                    {[...Array(2)].map((_, i) => (
                      <div key={i} className="h-24 rounded-xl bg-[var(--surface-hover)]" />
                    ))}
                  </div>
                )}
                {!popularLoading && popularCasts.length === 0 && (
                  <p className="text-xs text-center text-[var(--muted)]">No recent casts yet.</p>
                )}
                <ul className="space-y-0">
                  {popularCasts.map((cast) => {
                    const hash = cast.hash as string;
                    if (!hash) return null;
                    return (
                      <li key={hash}>
                        <CastCard cast={cast} viewerFid={viewerFid} variant="feed" />
                      </li>
                    );
                  })}
                </ul>
              </div>
            )}
          </div>
        </div>

        <div className="shrink-0 flex gap-2 px-4 pb-4 border-t border-[var(--border)] pt-3 bg-[var(--surface)]">
          <ProfileAddToColumnControl
            fid={fid}
            username={username}
            userColumns={getUserFeedColumns(columns)}
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
  );
}

function ProfileAddToColumnControl({
  fid,
  username,
  userColumns,
}: {
  fid?: number;
  username: string;
  userColumns: FeedColumnConfig[];
}) {
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

  const disabled = fid == null || userColumns.length === 0;
  const hint =
    userColumns.length === 0
      ? "Create a User column from the sidebar first"
      : fid == null
        ? "Loading profile…"
        : undefined;

  if (userColumns.length === 1) {
    const col = userColumns[0]!;
    const already = fid != null && userColumnHasFid(col, fid);
    return (
      <button
        type="button"
        disabled={disabled}
        title={hint}
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

  return (
    <details className="group flex-1 relative text-left">
      <summary
        title={hint}
        className={`py-2 rounded-xl border border-[var(--border)] text-sm font-medium text-center list-none cursor-pointer transition-colors [&::-webkit-details-marker]:hidden ${
          disabled
            ? "opacity-50 cursor-not-allowed pointer-events-none text-[var(--muted)]"
            : "text-[var(--foreground)] hover:bg-[var(--surface-hover)]"
        }`}
      >
        {message ?? "Add to column"}
      </summary>
      <ul className="absolute bottom-full left-0 right-0 mb-1.5 rounded-xl border border-[var(--border)] bg-[var(--surface)] shadow-xl overflow-hidden z-10 max-h-40 overflow-y-auto feed-scroll">
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
                <span className={`font-medium ${already ? "text-[var(--foreground)]" : "text-[var(--foreground)]"}`}>
                  {col.title}
                </span>
                <span className={`block text-[10px] ${already ? "text-[var(--recast)] group-hover/item:text-red-400" : "text-[var(--muted)]"}`}>
                  {already ? "✓ Added — click to remove" : "Click to add"}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </details>
  );
}

