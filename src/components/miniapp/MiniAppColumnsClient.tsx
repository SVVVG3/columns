"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { sdk } from "@farcaster/miniapp-sdk";
import { MiniAppSingleColumnFeed } from "@/components/miniapp/MiniAppSingleColumnFeed";
import { MiniAppToolbar } from "@/components/miniapp/MiniAppToolbar";
import {
  columnsCommunityChannelUrl,
  columnsFarcasterProfileUrl,
} from "@/lib/appUrl";
import { miniappFetch } from "@/lib/miniappFetch";
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
  const [viewer, setViewer] = useState<SessionUser | null>(null);
  const [allowed, setAllowed] = useState<boolean | null>(null);
  const [signInLoading, setSignInLoading] = useState(true);
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

        const isAllowed = await fetchColumnsAccess(fid);
        setAllowed(isAllowed);

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
  }, [refreshViewer]);

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
      {/* Column selector — only shown to allowlisted users with multiple columns */}
      {allowed && (
        <div className="shrink-0 border-b border-[var(--border)] px-4 py-3">
          <label className="block text-[10px] font-semibold uppercase tracking-wide text-[var(--muted)] mb-1.5">
            Column
          </label>
          {layoutLoading ? (
            <p className="text-sm text-[var(--muted)]">Loading saved columns…</p>
          ) : savedColumns.length === 0 ? (
            <p className="text-sm text-[var(--muted)]">
              No columns saved yet. Set up your board on desktop Columns first.
            </p>
          ) : (
            <select
              value={selectedId ?? savedColumns[0].id}
              onChange={(e) => setSelectedId(e.target.value)}
              className="w-full px-3 py-2.5 rounded-lg border border-[var(--border)] bg-[var(--surface)] text-sm font-medium text-[var(--foreground)]"
            >
              {savedColumns.map((col) => (
                <option key={col.id} value={col.id}>
                  {col.title}
                </option>
              ))}
            </select>
          )}
        </div>
      )}

      <div className="flex-1 min-h-0">
        {selectedColumn ? (
          <MiniAppSingleColumnFeed
            column={selectedColumn}
            viewerFid={viewer.fid}
            autoRefresh={allowed === true}
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
        followColumnsUrl={columnsUrl}
        communityUrl={communityUrl}
        activePage="columns"
      />
    </div>
  );
}
