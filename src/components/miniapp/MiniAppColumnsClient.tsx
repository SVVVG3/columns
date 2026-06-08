"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { sdk } from "@farcaster/miniapp-sdk";
import { MiniAppProfileMenu } from "@/components/profile/MiniAppProfileMenu";
import { MiniAppSingleColumnFeed } from "@/components/miniapp/MiniAppSingleColumnFeed";
import {
  columnsCommunityChannelUrl,
  columnsFarcasterProfileUrl,
  profileShareUrl,
} from "@/lib/appUrl";
import { miniappFetch } from "@/lib/miniappFetch";
import { farcasterProfileUrl } from "@/lib/profilePreview";
import type { FeedColumnConfig, SessionUser } from "@/types";

async function fetchColumnsAccess(fid: number): Promise<boolean> {
  const res = await fetch(`/api/miniapp/columns-access?fid=${fid}`);
  if (!res.ok) return false;
  const data = (await res.json()) as { allowed?: boolean };
  return !!data.allowed;
}

async function signInMiniApp(): Promise<SessionUser | null> {
  const res = await miniappFetch("/api/auth/miniapp", { method: "POST" });
  if (!res.ok) return null;
  const data = (await res.json()) as { user?: SessionUser };
  return data.user ?? null;
}

async function fetchLayout(): Promise<FeedColumnConfig[]> {
  const res = await miniappFetch("/api/layout", { cache: "no-store" });
  if (!res.ok) throw new Error("Failed to load columns");
  const data = (await res.json()) as { layout?: { columns?: FeedColumnConfig[] } | null };
  return data.layout?.columns ?? [];
}

export function MiniAppColumnsClient() {
  const router = useRouter();
  const [viewer, setViewer] = useState<SessionUser | null>(null);
  const [signInLoading, setSignInLoading] = useState(true);
  const [signInError, setSignInError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [shareMsg, setShareMsg] = useState<string | null>(null);

  const refreshViewer = useCallback(async () => {
    const res = await miniappFetch("/api/auth/miniapp", { cache: "no-store" });
    if (res.ok) {
      const data = (await res.json()) as { user?: SessionUser | null };
      if (data.user) {
        setViewer(data.user);
        return data.user;
      }
    }
    return null;
  }, []);

  useEffect(() => {
    void sdk.actions.ready().catch(() => {});
    void (async () => {
      setSignInLoading(true);
      setSignInError(null);
      try {
        const ctx = await sdk.context;
        const fid = ctx?.user?.fid;
        if (!fid) {
          setSignInError("Open this in Warpcast or another Farcaster client.");
          return;
        }
        const allowed = await fetchColumnsAccess(fid);
        if (!allowed) {
          router.replace("/profile/me");
          return;
        }

        let user = await refreshViewer();
        if (!user) {
          user = await signInMiniApp();
          setViewer(user);
        }
        if (!user) {
          setSignInError("Sign in was cancelled or failed.");
        }
      } catch {
        setSignInError("Could not sign in.");
      } finally {
        setSignInLoading(false);
      }
    })();
  }, [refreshViewer, router]);

  const { data: columns = [], isLoading: layoutLoading } = useQuery({
    queryKey: ["miniapp-layout", viewer?.fid],
    queryFn: fetchLayout,
    enabled: viewer?.fid != null,
    staleTime: 60_000,
  });

  useEffect(() => {
    if (columns.length === 0) {
      setSelectedId(null);
      return;
    }
    if (!selectedId || !columns.some((c) => c.id === selectedId)) {
      setSelectedId(columns[0].id);
    }
  }, [columns, selectedId]);

  const selectedColumn = useMemo(
    () => columns.find((c) => c.id === selectedId) ?? null,
    [columns, selectedId]
  );

  async function handleShare() {
    if (!viewer?.username) return;
    const url = profileShareUrl(viewer.username);
    try {
      await navigator.clipboard.writeText(url);
      setShareMsg("Link copied — paste into a cast to share your profile card.");
    } catch {
      setShareMsg(url);
    }
    setTimeout(() => setShareMsg(null), 4000);
  }

  const columnsUrl = columnsFarcasterProfileUrl();
  const communityUrl = columnsCommunityChannelUrl();
  const fcUrl = viewer?.username ? farcasterProfileUrl(viewer.username) : null;

  if (signInLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[var(--background)] text-[var(--muted)]">
        Loading your columns…
      </div>
    );
  }

  if (signInError || !viewer) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-3 bg-[var(--background)] px-6 text-center">
        <p className="text-[var(--foreground)] font-medium">
          {signInError ?? "Sign in required"}
        </p>
        <button
          type="button"
          onClick={() => {
            setSignInLoading(true);
            void signInMiniApp()
              .then((user) => {
                setViewer(user);
                if (!user) setSignInError("Sign in was cancelled or failed.");
              })
              .finally(() => setSignInLoading(false));
          }}
          className="px-4 py-2 rounded-xl bg-[var(--accent)] text-white text-sm font-medium"
        >
          Sign in with Farcaster
        </button>
      </div>
    );
  }

  return (
    <div className="h-full min-h-0 flex flex-col bg-[var(--background)] text-[var(--foreground)] max-w-lg mx-auto w-full">
      <div className="shrink-0 border-b border-[var(--border)] px-4 py-3">
        <label className="block text-[10px] font-semibold uppercase tracking-wide text-[var(--muted)] mb-1.5">
          Column
        </label>
        {layoutLoading ? (
          <p className="text-sm text-[var(--muted)]">Loading saved columns…</p>
        ) : columns.length === 0 ? (
          <p className="text-sm text-[var(--muted)]">
            No columns saved yet. Set up your board on desktop Columns first.
          </p>
        ) : (
          <select
            value={selectedId ?? columns[0].id}
            onChange={(e) => setSelectedId(e.target.value)}
            className="w-full px-3 py-2.5 rounded-lg border border-[var(--border)] bg-[var(--surface)] text-sm font-medium text-[var(--foreground)]"
          >
            {columns.map((col) => (
              <option key={col.id} value={col.id}>
                {col.title}
              </option>
            ))}
          </select>
        )}
      </div>

      <div className="flex-1 min-h-0">
        {selectedColumn ? (
          <MiniAppSingleColumnFeed column={selectedColumn} viewerFid={viewer.fid} />
        ) : (
          <div className="flex items-center justify-center h-full text-sm text-[var(--muted)] px-6 text-center">
            Your saved columns will appear here once you configure them on desktop.
          </div>
        )}
      </div>

      <div className="shrink-0 border-t border-[var(--border)] px-4 py-3">
        <MiniAppProfileMenu
          items={[
            {
              id: "my-columns",
              label: "My Columns",
              href: "/columns",
              icon: "columns",
            },
            {
              id: "share",
              label: "Copy share link",
              onClick: () => void handleShare(),
            },
            {
              id: "farcaster",
              label: "View on Farcaster",
              href: fcUrl ?? undefined,
              hidden: !fcUrl,
            },
            {
              id: "my-profile",
              label: "View My Profile",
              href: "/profile/me",
            },
            {
              id: "follow-columns",
              label: "Follow Columns",
              href: columnsUrl,
              icon: "columns",
            },
            {
              id: "community",
              label: "Join Community",
              href: communityUrl,
              icon: "farcaster",
            },
          ]}
        />
        {shareMsg && (
          <p className="mt-2 text-[10px] text-[var(--accent)] text-center">{shareMsg}</p>
        )}
      </div>
    </div>
  );
}
