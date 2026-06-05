"use client";

import Image from "next/image";
import { useEffect, useState } from "react";
import { UserAvatar } from "@/components/ui/UserAvatar";
import { useQuery } from "@tanstack/react-query";
import type { ProfileLink } from "@/lib/profileLinks";
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
import type { ProfileWallet } from "@/lib/profileWallets";
import type { FollowRelationship } from "@/lib/followCheck";
import { renderLinkifiedText } from "@/lib/linkifyText";
import { profileFollowStatusLines } from "@/lib/profileFollowLabels";
import {
  getUserFeedColumns,
  userColumnHasFid,
  userColumnTargetFids,
} from "@/lib/userColumn";
import { CastCard } from "@/components/cast/CastCard";
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
  const seed = useUiStore((s) => s.profilePreview);
  const closeProfilePreview = useUiStore((s) => s.closeProfilePreview);
  const openProfilePreview = useUiStore((s) => s.openProfilePreview);
  const conversationOpen = useUiStore((s) => s.selectedCastHash != null);
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

  useEffect(() => {
    if (!seed) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      if (useUiStore.getState().selectedCastHash) return;
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

  return (
    <div
      className={`fixed inset-0 z-[80] flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm transition-[filter,opacity] duration-200 ${
        conversationOpen ? "pointer-events-none" : ""
      }`}
      onClick={conversationOpen ? undefined : closeProfilePreview}
      role="presentation"
      aria-hidden={conversationOpen}
    >
      <div
        className={`w-full max-w-lg max-h-[min(92vh,720px)] flex flex-col bg-[var(--surface)] border border-[var(--border)] rounded-2xl shadow-2xl overflow-hidden transition-all duration-200 ${
          conversationOpen ? "blur-md opacity-40 scale-[0.98]" : ""
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
          <div className="flex flex-col items-center pt-3">
            <div className="flex justify-center w-full">
              <div className="flex items-start gap-6 text-left max-w-full">
              <UserAvatar src={pfpUrl} alt={displayName} size="xl" className="shrink-0" />
              <div className="min-w-0 pt-0.5">
                <p className="text-base font-semibold text-[var(--foreground)] leading-tight truncate">
                  {displayName}
                </p>
                <p className="text-sm text-[var(--muted)] truncate">@{username}</p>
                {(fid != null || wallets.length > 0) && (
                  <div className="mt-1">
                    {fid != null && wallets.length === 0 && (
                      <p className="text-[10px] text-[var(--muted)] font-mono">FID {fid}</p>
                    )}
                    {wallets.length > 0 && (
                      <ProfileWalletsDropdown wallets={wallets} fid={fid} align="left" />
                    )}
                  </div>
                )}
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
    const existing = userColumnTargetFids(column);
    if (userColumnHasFid(column, fid)) {
      setMessage(`Already in ${column.title}`);
      return;
    }
    const next = [...existing, fid];
    updateColumn(column.id, {
      targetFids: next,
      targetFid: undefined,
    });
    setMessage(`Added to ${column.title}`);
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
        disabled={disabled || already}
        title={already ? `Already in ${col.title}` : hint}
        onClick={() => addToColumn(col)}
        className="flex-1 py-2 rounded-xl border border-[var(--border)] text-sm font-medium text-[var(--foreground)] hover:bg-[var(--surface-hover)] disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
      >
        {message ?? (already ? "In column" : "Add to column")}
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
                disabled={already}
                onClick={() => addToColumn(col)}
                className="w-full px-3 py-2.5 text-left text-sm hover:bg-[var(--surface-hover)] disabled:opacity-50 transition-colors"
              >
                <span className="font-medium text-[var(--foreground)]">{col.title}</span>
                {already && (
                  <span className="block text-[10px] text-[var(--muted)]">Already added</span>
                )}
              </button>
            </li>
          );
        })}
      </ul>
    </details>
  );
}

function ProfileMetaSeparator() {
  return <span> · </span>;
}

function ProfileMetaLinksRow({
  links,
  joined,
  align = "center",
}: {
  links: ProfileLink[];
  joined?: string | null;
  align?: "left" | "center";
}) {
  return (
    <p
      className={`mt-3 text-xs text-[var(--muted)] w-full ${
        align === "left" ? "text-left" : "text-center"
      }`}
    >
      {links.map((link, index) => (
        <span key={link.href}>
          {index > 0 && <ProfileMetaSeparator />}
          <a
            href={link.href}
            target="_blank"
            rel="noopener noreferrer"
            className="text-[var(--accent)] hover:underline"
          >
            {link.kind === "url"
              ? link.label
              : link.kind === "twitter"
                ? `X ${link.label}`
                : `GitHub ${link.label}`}
          </a>
        </span>
      ))}
      {links.length > 0 && joined && <ProfileMetaSeparator />}
      {joined && <span>Joined {joined}</span>}
    </p>
  );
}

function ProfileWalletsDropdown({
  wallets,
  fid,
  align = "center",
}: {
  wallets: ProfileWallet[];
  fid?: number | null;
  align?: "left" | "center";
}) {
  return (
    <details className="group w-full text-left">
      <summary
        className={`text-xs text-[var(--muted)] cursor-pointer list-none hover:text-[var(--foreground)] transition-colors [&::-webkit-details-marker]:hidden ${
          align === "left" ? "text-left" : "text-center"
        }`}
      >
        {fid != null && <span className="font-mono">FID {fid}</span>}
        {fid != null && <ProfileMetaSeparator />}
        <span className="inline-flex items-center gap-0.5 align-middle">
          Wallets ({wallets.length})
          <svg
            className="w-3 h-3 transition-transform group-open:rotate-180"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
            aria-hidden
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </span>
      </summary>
      <ul className="w-full mt-2 rounded-xl border border-[var(--border)] bg-[var(--background)] divide-y divide-[var(--border)] overflow-hidden">
        {wallets.map((wallet) => (
          <ProfileWalletRow key={wallet.id} wallet={wallet} />
        ))}
      </ul>
    </details>
  );
}

function ProfileWalletRow({ wallet }: { wallet: ProfileWallet }) {
  const [copied, setCopied] = useState(false);
  const explorerLabel = wallet.address.startsWith("0x") ? "Basescan" : "Solscan";

  async function copyAddress() {
    try {
      await navigator.clipboard.writeText(wallet.address);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* ignore */
    }
  }

  return (
    <li className="px-3 py-2.5">
      <p className="text-[10px] font-medium text-[var(--muted)] mb-1">{wallet.label}</p>
      <p className="text-xs font-mono text-[var(--foreground)] break-all leading-snug">
        {wallet.address}
      </p>
      <div className="mt-2 flex gap-2">
        <button
          type="button"
          onClick={() => void copyAddress()}
          className="flex-1 py-1.5 rounded-lg border border-[var(--border)] text-[11px] font-medium text-[var(--foreground)] hover:bg-[var(--surface-hover)] transition-colors"
        >
          {copied ? "Copied" : "Copy"}
        </button>
        <a
          href={wallet.href}
          target="_blank"
          rel="noopener noreferrer"
          className="flex-1 py-1.5 rounded-lg border border-[var(--border)] text-[11px] font-medium text-center text-[var(--accent)] hover:bg-[var(--surface-hover)] transition-colors"
        >
          {explorerLabel}
        </a>
      </div>
    </li>
  );
}
