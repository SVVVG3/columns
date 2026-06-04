"use client";

import { useEffect } from "react";
import { UserAvatar } from "@/components/ui/UserAvatar";
import { useQuery } from "@tanstack/react-query";
import {
  farcasterProfileUrl,
  formatProfileCount,
  type ProfileDetails,
  type ProfilePreviewSeed,
} from "@/lib/profilePreview";
import type { FollowRelationship } from "@/lib/followCheck";
import { renderLinkifiedText } from "@/lib/linkifyText";
import { profileFollowStatusLines } from "@/lib/profileFollowLabels";
import { useUiStore } from "@/store/ui";

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

interface ProfilePreviewModalProps {
  viewerFid: number;
}

export function ProfilePreviewModal({ viewerFid }: ProfilePreviewModalProps) {
  const seed = useUiStore((s) => s.profilePreview);
  const closeProfilePreview = useUiStore((s) => s.closeProfilePreview);
  const openProfilePreview = useUiStore((s) => s.openProfilePreview);

  const { data: profile, isLoading, isError } = useQuery<ProfileDetails>({
    queryKey: ["profile", seed?.fid, seed?.username],
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

  useEffect(() => {
    if (!seed) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") closeProfilePreview();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [seed, closeProfilePreview]);

  if (!seed) return null;

  const displayName = profile?.displayName ?? seed.displayName ?? seed.username;
  const username = profile?.username ?? seed.username;
  const pfpUrl = profile?.pfpUrl ?? seed.pfpUrl;
  const profileUrl = farcasterProfileUrl(username);
  const followers = formatProfileCount(profile?.followerCount);
  const following = formatProfileCount(profile?.followingCount);
  const bio = profile?.bio;
  const followLines =
    followRel && username
      ? profileFollowStatusLines(username, followRel)
      : [];

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm"
      onClick={closeProfilePreview}
      role="presentation"
    >
      <div
        className="w-full max-w-sm bg-[var(--surface)] border border-[var(--border)] rounded-2xl shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-labelledby="profile-preview-title"
      >
        <div className="flex items-center justify-between px-4 pt-4 pb-2">
          <h2 id="profile-preview-title" className="text-sm font-semibold text-[var(--foreground)]">
            Profile
          </h2>
          <button
            type="button"
            onClick={closeProfilePreview}
            className="text-[var(--muted)] hover:text-[var(--foreground)] transition-colors p-1"
            aria-label="Close"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="px-4 pb-4 flex flex-col items-center text-center">
          <UserAvatar src={pfpUrl} alt={displayName} size="xl" className="mb-3" />

          <p className="text-base font-semibold text-[var(--foreground)] leading-tight">
            {displayName}
          </p>
          <p className="text-sm text-[var(--muted)]">@{username}</p>

          {(followers != null || following != null) && (
            <p className="text-xs text-[var(--muted)] mt-2">
              {followers != null && <span>{followers} followers</span>}
              {followers != null && following != null && <span> · </span>}
              {following != null && <span>{following} following</span>}
            </p>
          )}

          {showFollowStatus && followLoading && (
            <div className="w-32 h-3 mt-2 rounded bg-[var(--surface-hover)] animate-pulse" />
          )}

          {followLines.length > 0 && (
            <div className="mt-2 flex flex-col gap-0.5 w-full">
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

          {isLoading && !bio && (
            <div className="w-full mt-3 space-y-1.5 animate-pulse">
              <div className="h-2 rounded bg-[var(--surface-hover)] w-full" />
              <div className="h-2 rounded bg-[var(--surface-hover)] w-4/5 mx-auto" />
            </div>
          )}

          {bio && (
            <p className="text-xs text-[var(--foreground)] opacity-85 mt-3 leading-relaxed whitespace-pre-wrap break-words max-h-28 overflow-y-auto w-full">
              {renderLinkifiedText(bio, {
                onMentionClick: (username) =>
                  openProfilePreview({ username }),
              })}
            </p>
          )}

          {isError && (
            <p className="text-xs text-[var(--muted)] mt-3">Couldn&apos;t load full profile details.</p>
          )}
        </div>

        <div className="flex gap-2 px-4 pb-4 border-t border-[var(--border)] pt-3">
          <button
            type="button"
            onClick={closeProfilePreview}
            className="flex-1 py-2 rounded-xl border border-[var(--border)] text-sm text-[var(--foreground)] hover:bg-[var(--surface-hover)] transition-colors"
          >
            Close
          </button>
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
