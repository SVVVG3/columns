"use client";

import { create } from "zustand";
import type { SessionUser } from "@/types";

interface UserState {
  user: SessionUser | null;
  setUser: (user: SessionUser | null) => void;
}

export const useUserStore = create<UserState>()((set) => ({
  user: null,
  setUser: (user) => set({ user }),
}));
