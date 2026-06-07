"use client";

import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { UserAvatar } from "@/components/ui/UserAvatar";
import { profileSeedFromUnknown } from "@/lib/profilePreview";
import { useUiStore } from "@/store/ui";

import type { ReactionActorType } from "@/store/ui";

interface ReactionActorsModalProps {
  castHash: string | null;
  type: ReactionActorType | null;
  /** Pre-loaded actors (e.g. from aggregated notifications). */
  seedActors?: Record<string, unknown>[];
  onClose: () => void;
}

async function fetchReactionActors(
  hash: string,
  type: ReactionActorType
): Promise<Record<string, unknown>[]> {
  const res = await fetch(
    `/api/reaction/cast?hash=${encodeURIComponent(hash)}&types=${type}&limit=100`
  );
  if (!res.ok) throw new Error("Failed to load reactions");
  const data = (await res.json()) as {
    reactions?: Array<{ user?: Record<string, unknown> }>;
  };
  return (data.reactions ?? [])
    .map((r) => r.user)
    .filter((u): u is Record<string, unknown> => !!u);
}

function actorLabel(actor: Record<string, unknown>): string {
  return (
    (actor.display_name as string) ??
    (actor.displayName as string) ??
    (actor.username as string) ??
    "Someone"
  );
}

export function ReactionActorsModal({
  castHash,
  type,
  seedActors,
  onClose,
}: ReactionActorsModalProps) {
  const openProfilePreview = useUiStore((s) => s.openProfilePreview);
  const open = !!castHash && !!type;

  const { data: fetchedActors, isLoading, isError } = useQuery({
    queryKey: ["reaction-actors", castHash, type],
    queryFn: () => fetchReactionActors(castHash!, type!),
    enabled: open && (!seedActors || seedActors.length === 0),
    staleTime: 30_000,
  });

  const actors =
    seedActors && seedActors.length > 0 ? seedActors : (fetchedActors ?? []);

  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      onClose();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [open, onClose]);

  if (!open) return null;

  const title = type === "recasts" ? "Recasts" : "Likes";

  return (
    <div
      className="fixed inset-0 z-[92] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
      role="presentation"
      onClick={onClose}
    >
      <div
        className="w-full max-w-sm max-h-[min(70vh,480px)] flex flex-col bg-[var(--surface)] border border-[var(--border)] rounded-2xl shadow-2xl overflow-hidden"
        role="dialog"
        aria-label={title}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between gap-3 px-4 py-3 border-b border-[var(--border)] shrink-0">
          <span className="text-sm font-semibold text-[var(--foreground)]">{title}</span>
          <button
            type="button"
            onClick={onClose}
            className="text-[var(--muted)] hover:text-[var(--foreground)] transition-colors p-1"
            aria-label="Close"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="flex-1 overflow-y-auto feed-scroll min-h-0">
          {isLoading && actors.length === 0 && (
            <div className="p-4 space-y-3 animate-pulse">
              {[...Array(4)].map((_, i) => (
                <div key={i} className="flex gap-2.5">
                  <div className="w-9 h-9 rounded-full bg-[var(--surface-hover)] shrink-0" />
                  <div className="h-3 w-32 rounded bg-[var(--surface-hover)] mt-2" />
                </div>
              ))}
            </div>
          )}

          {isError && actors.length === 0 && (
            <p className="text-sm text-red-400 text-center py-8 px-4">Couldn&apos;t load {title.toLowerCase()}.</p>
          )}

          {actors.map((actor, i) => {
            const username = actor.username as string | undefined;
            const seed = profileSeedFromUnknown(actor);
            return (
              <button
                key={`${actor.fid ?? username ?? i}`}
                type="button"
                onClick={() => {
                  if (seed) openProfilePreview(seed);
                  onClose();
                }}
                className="w-full flex items-center gap-2.5 px-4 py-2.5 hover:bg-[var(--surface-hover)] transition-colors text-left"
              >
                <UserAvatar
                  src={(actor.pfp_url ?? actor.pfpUrl) as string | undefined}
                  alt={username ? `@${username}` : ""}
                  size="lg"
                />
                <div className="min-w-0">
                  <p className="text-sm font-medium text-[var(--foreground)] truncate">
                    {actorLabel(actor)}
                  </p>
                  {username && (
                    <p className="text-xs text-[var(--muted)] truncate">@{username}</p>
                  )}
                </div>
              </button>
            );
          })}

          {!isLoading && !isError && actors.length === 0 && (
            <p className="text-sm text-[var(--muted)] text-center py-8 px-4">No {title.toLowerCase()} yet.</p>
          )}
        </div>
      </div>
    </div>
  );
}
