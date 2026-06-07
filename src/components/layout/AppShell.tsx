"use client";

import { useRouter } from "next/navigation";
import type { SessionUser } from "@/types";
import { Sidebar } from "@/components/layout/Sidebar";
import { ColumnContainer } from "@/components/feed/ColumnContainer";
import { ConversationPanel } from "@/components/cast/ConversationPanel";
import { ProfilePreviewModal } from "@/components/profile/ProfilePreviewModal";
import { ReactionActorsModal } from "@/components/cast/ReactionActorsModal";
import { useUiStore } from "@/store/ui";
import { LayoutImportHandler } from "@/components/layout/LayoutImportHandler";

interface AppShellProps {
  user: SessionUser;
}

function ReactionActorsLayer() {
  const reactionActors = useUiStore((s) => s.reactionActors);
  const closeReactionActors = useUiStore((s) => s.closeReactionActors);
  return (
    <ReactionActorsModal
      castHash={reactionActors?.castHash ?? null}
      type={reactionActors?.type ?? null}
      seedActors={reactionActors?.seedActors}
      onClose={closeReactionActors}
    />
  );
}

export function AppShell({ user }: AppShellProps) {
  const router = useRouter();

  async function handleLogout() {
    await fetch("/api/auth/session", { method: "DELETE" });
    router.refresh();
  }

  return (
    <div className="flex h-full bg-[var(--background)]">
      <LayoutImportHandler />
      <Sidebar user={user} onLogout={handleLogout} />
      <div className="flex-1 min-w-0">
        <ColumnContainer viewerFid={user.fid} />
      </div>
      <ConversationPanel viewerFid={user.fid} />
      <ProfilePreviewModal viewerFid={user.fid} />
      <ReactionActorsLayer />
    </div>
  );
}
