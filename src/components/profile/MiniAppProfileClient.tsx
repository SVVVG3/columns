"use client";

import Image from "next/image";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { sdk } from "@farcaster/miniapp-sdk";
import farcasterLogoWhite from "../../../public/farcaster-logo-white.png";
import { UserAvatar } from "@/components/ui/UserAvatar";
import { ColumnsBadge } from "@/components/profile/ColumnsBadge";
import {
  ProfileMetaLinksRow,
  ProfileWalletsDropdown,
} from "@/components/profile/profileMeta";
import { Top8Section } from "@/components/profile/Top8Section";
import { MiniAppToolbar } from "@/components/miniapp/MiniAppToolbar";
import {
  columnsCommunityChannelUrl,
  columnsFarcasterProfileUrl,
  profileShareUrl,
} from "@/lib/appUrl";
import { miniappSession } from "@/lib/miniappSession";
import { renderLinkifiedText } from "@/lib/linkifyText";
import {
  farcasterProfileUrl,
  formatProfileCount,
  formatProfileJoinedDate,
  type ProfileDetails,
} from "@/lib/profilePreview";
import { useUiStore } from "@/store/ui";
import type { SessionUser } from "@/types";
import { useQuery } from "@tanstack/react-query";

async function fetchPublicProfile(username: string): Promise<ProfileDetails> {
  // Farcaster sometimes uses "fid:XXXXX" as a fallback username when the actual
  // username isn't resolved. Extract the FID and use the fid= param instead.
  const fidMatch = /^fid:(\d+)$/.exec(username);
  const url = fidMatch
    ? `/api/profile/public?fid=${fidMatch[1]}`
    : `/api/profile/public?username=${encodeURIComponent(username)}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error("Profile not found");
  const data = (await res.json()) as { user: ProfileDetails };
  return data.user;
}

async function fetchSessionUser(): Promise<SessionUser | null> {
  const sessionRes = await fetch("/api/auth/session", { cache: "no-store" });
  if (sessionRes.ok) {
    const data = (await sessionRes.json()) as { user?: SessionUser | null };
    if (data.user) return data.user;
  }

  const miniRes = await fetch("/api/auth/miniapp", { cache: "no-store" });
  if (miniRes.ok) {
    const data = (await miniRes.json()) as { user?: SessionUser | null };
    if (data.user) return data.user;
  }

  return null;
}

/** Small popover attached to the Farcaster icon button in the profile header. */
function FarcasterActionsPopover({
  fcUrl,
  ownsProfile,
  onShare,
}: {
  fcUrl: string | null;
  ownsProfile: boolean;
  onShare: () => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onPointerDown(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", onPointerDown);
    return () => document.removeEventListener("mousedown", onPointerDown);
  }, [open]);

  if (!fcUrl && !ownsProfile) return null;

  // For non-own profiles there is only one action — open directly, no dropdown.
  if (!ownsProfile && fcUrl) {
    return (
      <a
        href={fcUrl}
        target="_blank"
        rel="noopener noreferrer"
        className="p-0.5 rounded-full hover:bg-[var(--surface-hover)] transition-colors inline-flex items-center"
        aria-label="View on Farcaster"
      >
        <Image
          src={farcasterLogoWhite}
          alt=""
          width={16}
          height={16}
          className="object-contain"
        />
      </a>
    );
  }

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="p-0.5 rounded-full hover:bg-[var(--surface-hover)] transition-colors inline-flex items-center"
        aria-label="Farcaster actions"
        aria-expanded={open}
      >
        <Image
          src={farcasterLogoWhite}
          alt=""
          width={16}
          height={16}
          className="object-contain"
        />
      </button>

      {open && (
        <div className="absolute top-full right-0 mt-1.5 w-48 rounded-xl border border-[var(--border)] bg-[var(--surface)] shadow-lg overflow-hidden z-20">
          {fcUrl && (
            <a
              href={fcUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2.5 px-4 py-3 text-sm font-medium text-[var(--foreground)] hover:bg-[var(--surface-hover)]"
              onClick={() => setOpen(false)}
            >
              View on Farcaster
            </a>
          )}
          {ownsProfile && (
            <button
              type="button"
              className={`w-full flex items-center gap-2.5 px-4 py-3 text-sm font-medium text-left text-[var(--foreground)] hover:bg-[var(--surface-hover)] ${fcUrl ? "border-t border-[var(--border)]" : ""}`}
              onClick={() => {
                setOpen(false);
                onShare();
              }}
            >
              Copy share link
            </button>
          )}
        </div>
      )}
    </div>
  );
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
  const miniAppProfileStack = useUiStore((s) => s.miniAppProfileStack);
  const pushMiniAppProfile = useUiStore((s) => s.pushMiniAppProfile);
  const popMiniAppProfile = useUiStore((s) => s.popMiniAppProfile);

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
    if (user) miniappSession.write(user, miniappSession.read()?.allowed ?? false);
    return user;
  }, []);

  const signInWithMiniApp = useCallback(async () => {
    setSignInLoading(true);
    setSignInError(null);
    try {
      const res = await sdk.quickAuth.fetch("/api/auth/miniapp", {
        method: "POST",
      });
      if (!res.ok) {
        setSignInError("Sign in was cancelled or failed.");
        return null;
      }
      return await refreshViewer();
    } catch {
      setSignInError("Open this page in Warpcast or another Farcaster client to sign in.");
      return null;
    } finally {
      setSignInLoading(false);
    }
  }, [refreshViewer]);

  useEffect(() => {
    void sdk.actions.ready().then(() => setSdkReady(true)).catch(() => setSdkReady(true));
    void refreshViewer();
  }, [refreshViewer]);

  useEffect(() => {
    if (!isMeRoute || !sdkReady || viewer) return;
    void signInWithMiniApp().then((user) => {
      if (user?.username) {
        router.replace(`/profile/${encodeURIComponent(user.username)}`);
      }
    });
  }, [isMeRoute, sdkReady, viewer, signInWithMiniApp, router]);

  /** Sign in when viewing your own profile via a share link (not only /profile/me). */
  useEffect(() => {
    if (!sdkReady || viewer || !profile) return;
    void (async () => {
      try {
        const ctx = await sdk.context;
        if (ctx?.user?.fid === profile.fid) {
          await signInWithMiniApp();
        }
      } catch {
        /* not in a mini app host */
      }
    })();
  }, [sdkReady, viewer, profile, signInWithMiniApp]);

  const navigateToProfile = useCallback(
    (targetUsername: string) => {
      const clean = targetUsername.replace(/^@/, "").trim();
      if (!clean || clean === username) return;
      pushMiniAppProfile(username);
      router.push(`/profile/${encodeURIComponent(clean)}`);
    },
    [username, pushMiniAppProfile, router]
  );

  function handleBack() {
    const prev = popMiniAppProfile();
    if (prev) {
      router.push(`/profile/${encodeURIComponent(prev)}`);
    } else {
      router.push("/columns");
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

  const viewerFid = viewer?.fid;
  const ownsProfile = viewerFid != null && viewerFid === profile.fid;

  const fcUrl = farcasterProfileUrl(profile.username);
  const columnsUrl = columnsFarcasterProfileUrl();
  const communityUrl = columnsCommunityChannelUrl();
  const joined = formatProfileJoinedDate(profile.registeredAt);
  const followers = formatProfileCount(profile.followerCount);
  const following = formatProfileCount(profile.followingCount);
  const wallets = profile.wallets ?? [];
  const profileLinks = profile.profileLinks ?? [];
  const canGoBack = miniAppProfileStack.length > 0;

  return (
    <div className="h-full min-h-0 flex flex-col bg-[var(--background)] text-[var(--foreground)]">
      <div className="flex-1 min-h-0 overflow-y-auto feed-scroll max-w-lg mx-auto w-full">
        {canGoBack && (
          <div className="px-4 pt-3">
            <button
              type="button"
              onClick={handleBack}
              className="inline-flex items-center gap-1.5 text-sm font-medium text-[var(--accent)] hover:underline"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
              Back
            </button>
          </div>
        )}

        {profile.bannerUrl ? (
          <div className="relative w-full aspect-[3/1] bg-[var(--surface-hover)]">
            <Image src={profile.bannerUrl} alt="" fill className="object-cover" unoptimized />
          </div>
        ) : null}

        <div className="px-4 pt-4 pb-4">
          <div className="flex items-start gap-4">
            <UserAvatar src={profile.pfpUrl} alt={profile.displayName} size="xl" />
            <div className="min-w-0 flex-1 pt-1">
              <div className="flex items-center gap-2 min-w-0">
                <p className="text-lg font-semibold truncate">{profile.displayName}</p>
                {columnsBadge?.showBadge && <ColumnsBadge />}
              </div>
              <p className="text-sm text-[var(--muted)] truncate">@{profile.username}</p>
              <ProfileWalletsDropdown wallets={wallets} fid={profile.fid} />
            </div>
          </div>

          {profile.bio ? (
            <p className="mt-4 text-sm leading-relaxed whitespace-pre-wrap break-words">
              {renderLinkifiedText(profile.bio, {
                onMentionClick: (mentionUsername) => navigateToProfile(mentionUsername),
              })}
            </p>
          ) : null}

          {(followers != null || following != null) && (
            <div className="mt-3 flex items-center gap-1 text-xs text-[var(--muted)]">
              {followers != null && <span>{followers} followers</span>}
              {followers != null && following != null && <span> · </span>}
              {following != null && <span>{following} following</span>}
              {(fcUrl || ownsProfile) && (
                <>
                  <span> · View on</span>
                  <FarcasterActionsPopover
                    fcUrl={fcUrl}
                    ownsProfile={ownsProfile}
                    onShare={() => void handleShare()}
                  />
                </>
              )}
            </div>
          )}

          <ProfileMetaLinksRow links={profileLinks} joined={joined} align="left" />

          {shareMsg && (
            <p className="mt-2 text-[10px] text-[var(--accent)]">{shareMsg}</p>
          )}
          {signInError && (
            <p className="mt-2 text-[10px] text-red-400">{signInError}</p>
          )}

          <Top8Section
            ownerFid={profile.fid}
            isOwnProfile={ownsProfile}
            linkMode
            onProfileNavigate={navigateToProfile}
          />
        </div>
      </div>

      <MiniAppToolbar
        viewerPfp={viewer?.pfpUrl}
        viewerFid={viewer?.fid}
        followColumnsUrl={columnsUrl}
        communityUrl={communityUrl}
        activePage="profile"
      />
    </div>
  );
}
