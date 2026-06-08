"use client";

import Image from "next/image";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { sdk } from "@farcaster/miniapp-sdk";
import { UserAvatar } from "@/components/ui/UserAvatar";
import { ColumnsBadge } from "@/components/profile/ColumnsBadge";
import { Top8Section } from "@/components/profile/Top8Section";
import { profileShareUrl } from "@/lib/appUrl";
import {
  farcasterProfileUrl,
  formatProfileCount,
  formatProfileJoinedDate,
  type ProfileDetails,
} from "@/lib/profilePreview";
import type { SessionUser } from "@/types";

async function fetchPublicProfile(username: string): Promise<ProfileDetails> {
  const res = await fetch(
    `/api/profile/public?username=${encodeURIComponent(username)}`
  );
  if (!res.ok) throw new Error("Profile not found");
  const data = (await res.json()) as { user: ProfileDetails };
  return data.user;
}

async function fetchSessionUser(): Promise<SessionUser | null> {
  const res = await fetch("/api/auth/session", { cache: "no-store" });
  if (!res.ok) return null;
  const data = (await res.json()) as { user?: SessionUser | null };
  return data.user ?? null;
}

interface MiniAppProfileClientProps {
  username: string;
  isMeRoute?: boolean;
}

export function MiniAppProfileClient({
  username,
  isMeRoute = false,
}: MiniAppProfileClientProps) {
  const router = useRouter();
  const [viewer, setViewer] = useState<SessionUser | null>(null);
  const [signInLoading, setSignInLoading] = useState(false);
  const [signInError, setSignInError] = useState<string | null>(null);
  const [shareMsg, setShareMsg] = useState<string | null>(null);
  const [sdkReady, setSdkReady] = useState(false);

  const profileEnabled = username.length > 0;

  const { data: profile, isLoading, isError } = useQuery({
    queryKey: ["miniapp-profile", username],
    queryFn: () => fetchPublicProfile(username),
    enabled: profileEnabled,
    staleTime: 60_000,
  });

  const { data: columnsBadge } = useQuery({
    queryKey: ["columns-user", profile?.fid],
    queryFn: async () => {
      const res = await fetch(`/api/columns-user?fid=${profile!.fid}`);
      if (!res.ok) return { showBadge: false };
      return res.json() as Promise<{ showBadge: boolean }>;
    },
    enabled: profile?.fid != null,
    staleTime: 300_000,
  });

  const refreshViewer = useCallback(async () => {
    const user = await fetchSessionUser();
    setViewer(user);
    return user;
  }, []);

  useEffect(() => {
    void sdk.actions.ready().then(() => setSdkReady(true)).catch(() => setSdkReady(true));
    void refreshViewer();
  }, [refreshViewer]);

  useEffect(() => {
    if (!isMeRoute || !sdkReady || viewer) return;
    void signInWithMiniApp();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isMeRoute, sdkReady, viewer]);

  async function signInWithMiniApp() {
    setSignInLoading(true);
    setSignInError(null);
    try {
      const res = await sdk.quickAuth.fetch("/api/auth/miniapp", {
        method: "POST",
      });
      if (!res.ok) {
        setSignInError("Sign in was cancelled or failed.");
        return;
      }
      const user = await refreshViewer();
      if (user && isMeRoute && user.username) {
        router.replace(`/profile/${encodeURIComponent(user.username)}`);
      }
    } catch {
      setSignInError("Open this page in Warpcast or another Farcaster client to sign in.");
    } finally {
      setSignInLoading(false);
    }
  }

  async function handleShare() {
    if (!profile) return;
    const url = profileShareUrl(profile.username);
    try {
      await navigator.clipboard.writeText(url);
      setShareMsg("Link copied — paste into a cast to share your profile card.");
    } catch {
      setShareMsg(url);
    }
    setTimeout(() => setShareMsg(null), 4000);
  }

  if (!profileEnabled && isMeRoute) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-4 bg-[var(--background)] px-6 text-center">
        <p className="text-lg font-semibold text-[var(--foreground)]">Your Columns profile</p>
        <p className="text-sm text-[var(--muted)] max-w-sm">
          Sign in with Farcaster to edit your Top 8 and copy a shareable profile link for casts.
        </p>
        <button
          type="button"
          onClick={() => void signInWithMiniApp()}
          disabled={signInLoading}
          className="px-5 py-2.5 rounded-xl bg-[var(--accent)] text-white text-sm font-medium disabled:opacity-50"
        >
          {signInLoading ? "Signing in…" : "Sign in with Farcaster"}
        </button>
        {signInError && <p className="text-xs text-red-400">{signInError}</p>}
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[var(--background)] text-[var(--muted)]">
        Loading profile…
      </div>
    );
  }

  if (isError || !profile) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-3 bg-[var(--background)] px-6 text-center">
        <p className="text-[var(--foreground)] font-medium">Profile not found</p>
        {isMeRoute && (
          <button
            type="button"
            onClick={() => void signInWithMiniApp()}
            className="px-4 py-2 rounded-xl bg-[var(--accent)] text-white text-sm font-medium"
          >
            Sign in with Farcaster
          </button>
        )}
      </div>
    );
  }

  const isOwnProfile = viewer?.fid === profile.fid;
  const fcUrl = farcasterProfileUrl(profile.username);
  const joined = formatProfileJoinedDate(profile.registeredAt);
  const followers = formatProfileCount(profile.followerCount);
  const following = formatProfileCount(profile.followingCount);

  return (
    <div className="min-h-screen bg-[var(--background)] text-[var(--foreground)]">
      <div className="max-w-lg mx-auto pb-8">
        {profile.bannerUrl ? (
          <div className="relative w-full aspect-[3/1] bg-[var(--surface-hover)]">
            <Image src={profile.bannerUrl} alt="" fill className="object-cover" unoptimized />
          </div>
        ) : null}

        <div className="px-4 pt-4">
          <div className="flex items-start gap-4">
            <UserAvatar src={profile.pfpUrl} alt={profile.displayName} size="xl" />
            <div className="min-w-0 flex-1 pt-1">
              <p className="text-lg font-semibold truncate">{profile.displayName}</p>
              <p className="text-sm text-[var(--muted)] truncate">@{profile.username}</p>
              {columnsBadge?.showBadge && (
                <div className="mt-2">
                  <ColumnsBadge />
                </div>
              )}
            </div>
          </div>

          {profile.bio ? (
            <p className="mt-4 text-sm leading-relaxed whitespace-pre-wrap">{profile.bio}</p>
          ) : null}

          {(followers != null || following != null || joined) && (
            <p className="mt-3 text-xs text-[var(--muted)]">
              {followers != null && <span>{followers} followers</span>}
              {followers != null && following != null && <span> · </span>}
              {following != null && <span>{following} following</span>}
              {joined && (
                <>
                  {(followers != null || following != null) && <span> · </span>}
                  <span>Joined {joined}</span>
                </>
              )}
            </p>
          )}

          <Top8Section
            ownerFid={profile.fid}
            isOwnProfile={isOwnProfile}
            linkMode
          />

          <div className="mt-6 flex flex-col gap-2">
            {isOwnProfile && (
              <button
                type="button"
                onClick={() => void handleShare()}
                className="w-full py-2.5 rounded-xl bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-white text-sm font-medium"
              >
                Copy share link
              </button>
            )}
            {!isOwnProfile && isMeRoute && !viewer && (
              <button
                type="button"
                onClick={() => void signInWithMiniApp()}
                disabled={signInLoading}
                className="w-full py-2.5 rounded-xl bg-[var(--accent)] text-white text-sm font-medium disabled:opacity-50"
              >
                {signInLoading ? "Signing in…" : "Sign in with Farcaster"}
              </button>
            )}
            {fcUrl && (
              <a
                href={fcUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="w-full py-2.5 rounded-xl border border-[var(--border)] text-center text-sm font-medium hover:bg-[var(--surface-hover)]"
              >
                View on Farcaster
              </a>
            )}
            <a
              href="/"
              className="w-full py-2.5 rounded-xl border border-[var(--border)] text-center text-sm text-[var(--muted)] hover:bg-[var(--surface-hover)]"
            >
              Columns app
            </a>
          </div>

          {shareMsg && (
            <p className="mt-3 text-xs text-[var(--accent)] text-center">{shareMsg}</p>
          )}
          {signInError && (
            <p className="mt-3 text-xs text-red-400 text-center">{signInError}</p>
          )}
        </div>
      </div>
    </div>
  );
}
