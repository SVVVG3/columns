"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { FeedColumnConfig, PersistedLayout } from "@/types";

const SCHEMA_VERSION = 3 as const;

const DEFAULT_REFRESH_MS = 60_000;

const DEFAULT_COLUMNS: FeedColumnConfig[] = [
  { id: "home", type: "home", title: "Home", refreshInterval: DEFAULT_REFRESH_MS },
];

/** Migrate columns saved with the old 2-minute default. */
function normalizeColumns(columns: FeedColumnConfig[]): FeedColumnConfig[] {
  return columns.map((c) => ({
    ...c,
    refreshInterval:
      c.refreshInterval == null || c.refreshInterval >= 120_000
        ? DEFAULT_REFRESH_MS
        : c.refreshInterval,
  }));
}

interface ColumnsState {
  columns: FeedColumnConfig[];
  addColumn: (column: FeedColumnConfig) => void;
  removeColumn: (id: string) => void;
  updateColumn: (id: string, updates: Partial<FeedColumnConfig>) => void;
  reorderColumns: (orderedIds: string[]) => void;
  /** Replace the full column layout (e.g. after importing a shared layout). */
  replaceColumns: (columns: FeedColumnConfig[]) => void;
  resetToDefaults: () => void;
}

export const useColumnsStore = create<ColumnsState>()(
  persist(
    (set, get) => ({
      columns: DEFAULT_COLUMNS,

      addColumn: (column) =>
        set((state) => ({ columns: [...state.columns, column] })),

      removeColumn: (id) =>
        set((state) => ({
          columns: state.columns.filter((c) => c.id !== id),
        })),

      updateColumn: (id, updates) =>
        set((state) => ({
          columns: state.columns.map((c) =>
            c.id === id ? { ...c, ...updates } : c
          ),
        })),

      reorderColumns: (orderedIds) =>
        set((state) => {
          const map = new Map(state.columns.map((c) => [c.id, c]));
          return {
            columns: orderedIds
              .map((id) => map.get(id))
              .filter(Boolean) as FeedColumnConfig[],
          };
        }),

      replaceColumns: (columns) => set({ columns }),

      resetToDefaults: () => set({ columns: DEFAULT_COLUMNS }),
    }),
    {
      name: "fc_columns_v2",
      // Validate schema version on rehydration; reset if stale
      merge: (persisted, current) => {
        const p = persisted as { schemaVersion?: number } & ColumnsState;
        if (!p || p.schemaVersion !== SCHEMA_VERSION) {
          return { ...current, columns: DEFAULT_COLUMNS };
        }
        const state = persisted as ColumnsState;
        return {
          ...current,
          ...state,
          columns: normalizeColumns(state.columns ?? DEFAULT_COLUMNS),
        };
      },
      // Inject schemaVersion into every persisted write
      partialize: (state) =>
        ({
          schemaVersion: SCHEMA_VERSION,
          columns: state.columns,
        }) as unknown as PersistedLayout & ColumnsState,
    }
  )
);
