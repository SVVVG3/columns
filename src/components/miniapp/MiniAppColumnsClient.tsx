"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { sdk } from "@farcaster/miniapp-sdk";
import {
  MiniAppSingleColumnFeed,
  RefreshButton,
} from "@/components/miniapp/MiniAppSingleColumnFeed";
import { MiniAppToolbar } from "@/components/miniapp/MiniAppToolbar";
import {
  columnsCommunityChannelUrl,
  columnsFarcasterProfileUrl,
} from "@/lib/appUrl";
import { miniappFetch } from "@/lib/miniappFetch";
import { miniappSession } from "@/lib/miniappSession";
import { useUiStore } from "@/store/ui";
import type { FeedColumnConfig, SessionUser } from "@/types";

/** Home feed column shown to all non-allowlisted mini app users. */
const HOME_COLUMN: FeedColumnConfig = {
  id: "home",
  type: "home",
  title: "Home Feed",
};

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
  // Seed from cache so we skip the loading spinner on re-visits
  const cached = miniappSession.read();
  const [viewer, setViewer] = useState<SessionUser | null>(cached?.viewer ?? null);
  const [allowed, setAllowed] = useState<boolean | null>(cached?.allowed ?? null);
  const [signInLoading, setSignInLoading] = useState(cached === null);
  const [signInError, setSignInError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);

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

    // If we have a cached session, revalidate silently in the background
    if (cached) {
      void (async () => {
        try {
          const ctx = await sdk.context;
          const fid = ctx?.user?.fid ?? cached.viewer.fid;
          const [isAllowed, user] = await Promise.all([
            fetchColumnsAccess(fid),
            refreshViewer(),
          ]);
          const resolvedUser = user ?? cached.viewer;
          setAllowed(isAllowed);
          setViewer(resolvedUser);
          miniappSession.write(resolvedUser, isAllowed);
        } catch {
          /* keep stale cache */
        }
      })();
      return;
    }

    // Cold start — full sign-in flow
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

        const [isAllowed, existingUser] = await Promise.all([
          fetchColumnsAccess(fid),
          refreshViewer(),
        ]);
        setAllowed(isAllowed);

        let user = existingUser;
        if (!user) {
          user = await signInMiniApp();
          setViewer(user);
        }
        if (!user) {
          setSignInError("Sign in was cancelled or failed.");
          return;
        }
        miniappSession.write(user, isAllowed);
      } catch {
        setSignInError("Could not sign in.");
      } finally {
        setSignInLoading(false);
      }
    })();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // When a cast is tapped, open it in Farcaster and close the mini app.
  const selectedCastHash = useUiStore((s) => s.selectedCastHash);
  const closeConversation = useUiStore((s) => s.closeConversation);
  useEffect(() => {
    if (!selectedCastHash) return;
    const hash = selectedCastHash.startsWith("0x")
      ? selectedCastHash
      : `0x${selectedCastHash}`;
    void sdk.actions.viewCast({ hash }).catch(() => {});
    closeConversation();
  }, [selectedCastHash, closeConversation]);

  const { data: savedColumns = [], isLoading: layoutLoading } = useQuery({
    queryKey: ["miniapp-layout", viewer?.fid],
    queryFn: fetchLayout,
    enabled: viewer?.fid != null && allowed === true,
    staleTime: 60_000,
  });

  // Allowlisted users pick from their saved columns; others always see home feed.
  const columns: FeedColumnConfig[] = allowed ? savedColumns : [HOME_COLUMN];

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

  const columnsUrl = columnsFarcasterProfileUrl();
  const communityUrl = columnsCommunityChannelUrl();

  if (signInLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[var(--background)] text-[var(--muted)]">
        Loading…
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
                else miniappSession.write(user, allowed ?? false);
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
      <div className="flex-1 min-h-0">
        {selectedColumn ? (
          <MiniAppSingleColumnFeed
            column={selectedColumn}
            viewerFid={viewer.fid}
            autoRefresh={allowed === true}
            renderHeader={(isFetching, refetch) =>
              allowed ? (
                /* Allowlisted: dropdown + refresh in one row */
                <div className="shrink-0 flex items-center gap-2 px-3 py-2 border-b border-[var(--border)] bg-[var(--background)]">
                  {layoutLoading ? (
                    <p className="flex-1 text-sm text-[var(--muted)]">Loading…</p>
                  ) : savedColumns.length === 0 ? (
                    <p className="flex-1 text-sm text-[var(--muted)]">No columns saved yet.</p>
                  ) : (
                    <select
                      value={selectedId ?? savedColumns[0].id}
                      onChange={(e) => setSelectedId(e.target.value)}
                      className="flex-1 min-w-0 px-3 py-2 rounded-lg border border-[var(--border)] bg-[var(--surface)] text-sm font-medium text-[var(--foreground)]"
                    >
                      {savedColumns.map((col) => (
                        <option key={col.id} value={col.id}>
                          {col.title}
                        </option>
                      ))}
                    </select>
                  )}
                  <RefreshButton isFetching={isFetching} onRefresh={refetch} />
                </div>
              ) : (
                /* Non-allowlisted: just refresh button */
                <div className="shrink-0 flex items-center justify-end px-3 py-2 border-b border-[var(--border)] bg-[var(--background)]">
                  <RefreshButton isFetching={isFetching} onRefresh={refetch} />
                </div>
              )
            }
          />
        ) : (
          <div className="flex items-center justify-center h-full text-sm text-[var(--muted)] px-6 text-center">
            {allowed
              ? "Your saved columns will appear here once you configure them on desktop."
              : "Loading your feed…"}
          </div>
        )}
      </div>

      <MiniAppToolbar
        viewerPfp={viewer.pfpUrl}
        viewerFid={viewer.fid}
        followColumnsUrl={columnsUrl}
        communityUrl={communityUrl}
        activePage="columns"
      />
    </div>
  );
}
