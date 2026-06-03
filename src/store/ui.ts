"use client";

import { create } from "zustand";

interface UiState {
  /** Navigation stack of cast hashes — current is last, empty means panel closed */
  conversationHistory: string[];
  /** Derived: the cast hash currently shown in the panel (top of stack) */
  selectedCastHash: string | null;
  /** Push a new cast onto the stack (opens or navigates forward) */
  openConversation: (hash: string) => void;
  /** Pop the current cast off the stack (go back, or close if at root) */
  goBack: () => void;
  closeConversation: () => void;
}

export const useUiStore = create<UiState>()((set) => ({
  conversationHistory: [],
  selectedCastHash: null,
  openConversation: (hash) =>
    set((s) => {
      const history = [...s.conversationHistory, hash];
      return { conversationHistory: history, selectedCastHash: hash };
    }),
  goBack: () =>
    set((s) => {
      const history = s.conversationHistory.slice(0, -1);
      return {
        conversationHistory: history,
        selectedCastHash: history.length > 0 ? history[history.length - 1] : null,
      };
    }),
  closeConversation: () =>
    set({ conversationHistory: [], selectedCastHash: null }),
}));
