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
import { buildMiniAppColumnList } from "@/lib/miniappColumns";
import { miniappFetch } from "@/lib/miniappFetch";
import { miniappSession } from "@/lib/miniappSession";
import { useUiStore } from "@/store/ui";
import type { FeedColumnConfig, SessionUser } from "@/types";

const SELECTED_COL_KEY = "miniapp_selected_col";

function readSavedColumnId(): string | null {
  try { return sessionStorage.getItem(SELECTED_COL_KEY); } catch { return null; }
}
function saveColumnId(id: string): void {
  try { sessionStorage.setItem(SELECTED_COL_KEY, id); } catch { /* ignore */ }
}

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
  if (!res.ok) return [];
  const data = (await res.json()) as { layout?: { columns?: FeedColumnConfig[] } | null };
  return data.layout?.columns ?? [];
}

export function MiniAppColumnsClient() {
  const cached = miniappSession.read();
  const [viewer, setViewer] = useState<SessionUser | null>(cached?.viewer ?? null);
  const [isPro, setIsPro] = useState<boolean | null>(cached?.allowed ?? null);
  const [signInLoading, setSignInLoading] = useState(cached === null);
  const [signInError, setSignInError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(readSavedColumnId);

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

    if (cached) {
      void (async () => {
        try {
          const ctx = await sdk.context;
          const fid = ctx?.user?.fid ?? cached.viewer.fid;
          const [allowed, user] = await Promise.all([
            fetchColumnsAccess(fid),
            refreshViewer(),
          ]);
          const resolvedUser = user ?? cached.viewer;
          setIsPro(allowed);
          setViewer(resolvedUser);
          miniappSession.write(resolvedUser, allowed);
        } catch {
          /* keep stale cache */
        }
      })();
      return;
    }

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

        const [allowed, existingUser] = await Promise.all([
          fetchColumnsAccess(fid),
          refreshViewer(),
        ]);
        setIsPro(allowed);

        let user = existingUser;
        if (!user) {
          user = await signInMiniApp();
          setViewer(user);
        }
        if (!user) {
          setSignInError("Sign in was cancelled or failed.");
          return;
        }
        miniappSession.write(user, allowed);
      } catch {
        setSignInError("Could not sign in.");
      } finally {
        setSignInLoading(false);
      }
    })();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
    enabled: viewer?.fid != null,
    staleTime: 60_000,
  });

  const columns: FeedColumnConfig[] = useMemo(
    () => buildMiniAppColumnList(savedColumns, isPro === true),
    [savedColumns, isPro]
  );

  useEffect(() => {
    if (selectedId) saveColumnId(selectedId);
  }, [selectedId]);

  useEffect(() => {
    if (columns.length === 0) {
      setSelectedId(null);
      return;
    }
    const saved = readSavedColumnId();
    if (saved && columns.some((c) => c.id === saved)) {
      setSelectedId(saved);
    } else if (!selectedId || !columns.some((c) => c.id === selectedId)) {
      setSelectedId(columns[0].id);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [columns]);

  const selectedColumn = useMemo(
    () => columns.find((c) => c.id === selectedId) ?? columns[0] ?? null,
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
                else miniappSession.write(user, isPro ?? false);
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
            autoRefresh
            renderHeader={(isFetching, refetch) => (
              <div className="shrink-0 flex items-center gap-2 px-3 py-2 border-b border-[var(--border)] bg-[var(--background)]">
                {layoutLoading ? (
                  <p className="flex-1 text-sm text-[var(--muted)]">Loading…</p>
                ) : (
                  <select
                    value={selectedId ?? columns[0]?.id}
                    onChange={(e) => {
                      setSelectedId(e.target.value);
                      saveColumnId(e.target.value);
                    }}
                    className="flex-1 min-w-0 px-3 py-2 rounded-lg border border-[var(--border)] bg-[var(--surface)] text-sm font-medium text-[var(--foreground)]"
                  >
                    {columns.map((col) => (
                      <option key={col.id} value={col.id}>
                        {col.title}
                      </option>
                    ))}
                  </select>
                )}
                <RefreshButton isFetching={isFetching} onRefresh={refetch} />
              </div>
            )}
          />
        ) : (
          <div className="flex items-center justify-center h-full text-sm text-[var(--muted)] px-6 text-center">
            Loading your feed…
          </div>
        )}
      </div>

      <MiniAppToolbar
        viewerPfp={viewer.pfpUrl}
        viewerFid={viewer.fid}
        isPro={isPro === true}
        savedColumns={savedColumns}
        followColumnsUrl={columnsUrl}
        communityUrl={communityUrl}
        activePage="columns"
      />
    </div>
  );
}
