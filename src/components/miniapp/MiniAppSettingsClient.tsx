"use client";

import { useEffect, useState } from "react";
import { useTheme } from "@/components/layout/Providers";
import { MiniAppProPanel } from "@/components/miniapp/MiniAppProPanel";
import { MiniAppToolbar } from "@/components/miniapp/MiniAppToolbar";
import { ColumnsBadge } from "@/components/profile/ColumnsBadge";
import {
  columnsCommunityChannelUrl,
  columnsFarcasterProfileUrl,
} from "@/lib/appUrl";
import { miniappSession } from "@/lib/miniappSession";
import type { SessionUser } from "@/types";

async function fetchSessionUser(): Promise<SessionUser | null> {
  const res = await fetch("/api/auth/miniapp", { cache: "no-store" });
  if (!res.ok) return null;
  const data = (await res.json()) as { user?: SessionUser | null };
  return data.user ?? null;
}

export function MiniAppSettingsClient() {
  const cached = miniappSession.read();
  const [viewer, setViewer] = useState<SessionUser | null>(cached?.viewer ?? null);
  const [isPro, setIsPro] = useState(cached?.allowed ?? false);
  const { theme, toggleTheme } = useTheme();

  useEffect(() => {
    void (async () => {
      const user = await fetchSessionUser();
      if (user) setViewer(user);
      const session = miniappSession.read();
      if (session) setIsPro(session.allowed);
    })();
  }, []);

  const columnsUrl = columnsFarcasterProfileUrl();
  const communityUrl = columnsCommunityChannelUrl();

  return (
    <div className="h-full min-h-0 flex flex-col bg-[var(--background)] text-[var(--foreground)] max-w-lg mx-auto w-full">
      <div className="flex-1 min-h-0 overflow-y-auto">
        <div className="px-4 py-5 flex items-center gap-3">
          <h1 className="text-lg font-semibold">Settings</h1>
          {isPro && <ColumnsBadge />}
        </div>

        <div className="px-4 space-y-1">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-[var(--muted)] px-1 pb-1">
            Appearance
          </p>
          <button
            type="button"
            onClick={toggleTheme}
            className="w-full flex items-center justify-between gap-3 px-4 py-3 rounded-xl border border-[var(--border)] bg-[var(--surface)] hover:bg-[var(--surface-hover)] transition-colors"
          >
            <span className="text-sm font-medium">Theme</span>
            <span className="text-sm text-[var(--muted)]">
              {theme === "dark" ? "Dark" : "Light"}
            </span>
          </button>
        </div>

        {!isPro && (
          <div className="px-4 mt-6">
            <MiniAppProPanel
              viewerFid={viewer?.fid}
              followColumnsUrl={columnsUrl}
              communityUrl={communityUrl}
              showFeatureHeader={false}
              featureDescription="Free users get Home plus 1 custom column. Pro unlocks search, up to 10 custom columns, and the full desktop experience."
            />
          </div>
        )}
      </div>

      <MiniAppToolbar
        viewerPfp={viewer?.pfpUrl}
        viewerFid={viewer?.fid}
        isPro={isPro}
        followColumnsUrl={columnsUrl}
        communityUrl={communityUrl}
        activePage="settings"
      />
    </div>
  );
}
