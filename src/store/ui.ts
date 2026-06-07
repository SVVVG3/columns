"use client";

import { create } from "zustand";
import type { ProfilePreviewSeed } from "@/lib/profilePreview";

export type ReactionActorType = "likes" | "recasts";

export interface ReactionActorsState {
  castHash: string;
  type: ReactionActorType;
  seedActors?: Record<string, unknown>[];
}

export type OverlayFocus = "profile" | "conversation" | null;

interface UiState {
  /** Navigation stack of cast hashes — current is last, empty means panel closed */
  conversationHistory: string[];
  /** Derived: the cast hash currently shown in the panel (top of stack) */
  selectedCastHash: string | null;
  /** Which overlay receives clicks / Escape when profile + thread are both open */
  overlayFocus: OverlayFocus;
  /** Push a new cast onto the stack (opens or navigates forward) */
  openConversation: (hash: string) => void;
  /** Pop the current cast off the stack (go back, or close if at root) */
  goBack: () => void;
  closeConversation: () => void;
  profilePreview: ProfilePreviewSeed | null;
  openProfilePreview: (seed: ProfilePreviewSeed) => void;
  closeProfilePreview: () => void;
  reactionActors: ReactionActorsState | null;
  openReactionActors: (state: ReactionActorsState) => void;
  closeReactionActors: () => void;
}

export const useUiStore = create<UiState>()((set) => ({
  conversationHistory: [],
  selectedCastHash: null,
  overlayFocus: null,
  openConversation: (hash) =>
    set((s) => {
      const history = [...s.conversationHistory, hash];
      return {
        conversationHistory: history,
        selectedCastHash: hash,
        overlayFocus: "conversation",
      };
    }),
  goBack: () =>
    set((s) => {
      const history = s.conversationHistory.slice(0, -1);
      const selectedCastHash = history.length > 0 ? history[history.length - 1] : null;
      return {
        conversationHistory: history,
        selectedCastHash,
        overlayFocus: selectedCastHash
          ? "conversation"
          : s.profilePreview
            ? "profile"
            : null,
      };
    }),
  closeConversation: () =>
    set((s) => ({
      conversationHistory: [],
      selectedCastHash: null,
      overlayFocus: s.profilePreview ? "profile" : null,
    })),
  profilePreview: null,
  openProfilePreview: (seed) =>
    set({ profilePreview: seed, overlayFocus: "profile" }),
  closeProfilePreview: () =>
    set((s) => ({
      profilePreview: null,
      overlayFocus: s.selectedCastHash ? "conversation" : null,
    })),
  reactionActors: null,
  openReactionActors: (state) => set({ reactionActors: state }),
  closeReactionActors: () => set({ reactionActors: null }),
}));
