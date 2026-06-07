"use client";

import { useEffect, useRef } from "react";
import { useColumnsStore } from "@/store/columns";
import type { FeedColumnConfig } from "@/types";

const SCHEMA_VERSION = 3;
const SAVE_DEBOUNCE_MS = 1500;

async function saveLayoutToServer(columns: FeedColumnConfig[]): Promise<boolean> {
  const res = await fetch("/api/layout", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ schemaVersion: SCHEMA_VERSION, columns }),
  });
  return res.ok;
}

/** Hydrate column board from Supabase on login; debounce saves on changes. */
export function LayoutSyncHandler() {
  const initialSyncDone = useRef(false);
  const skipSave = useRef(true);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function syncFromServer() {
      try {
        const res = await fetch("/api/layout", { cache: "no-store" });
        if (!res.ok || cancelled) return;

        const data = (await res.json()) as {
          layout?: { columns?: FeedColumnConfig[] } | null;
          configured?: boolean;
        };

        skipSave.current = true;
        const serverColumns = data.layout?.columns;
        const localColumns = useColumnsStore.getState().columns;

        if (serverColumns && serverColumns.length > 0) {
          useColumnsStore.getState().replaceColumns(serverColumns);
        } else if (localColumns.length > 0 && data.configured !== false) {
          await saveLayoutToServer(localColumns);
        }
      } catch (err) {
        console.error("[layout sync]", err);
      } finally {
        if (!cancelled) {
          initialSyncDone.current = true;
          setTimeout(() => {
            skipSave.current = false;
          }, 200);
        }
      }
    }

    const runSync = () => {
      void syncFromServer();
    };

    if (useColumnsStore.persist.hasHydrated()) {
      runSync();
    } else {
      const unsub = useColumnsStore.persist.onFinishHydration(runSync);
      return () => {
        cancelled = true;
        unsub();
      };
    }

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const scheduleSave = (columns: FeedColumnConfig[]) => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
      saveTimer.current = setTimeout(() => {
        void saveLayoutToServer(columns).catch((err) => {
          console.error("[layout sync] save failed:", err);
        });
      }, SAVE_DEBOUNCE_MS);
    };

    const unsub = useColumnsStore.subscribe((state, prev) => {
      if (!initialSyncDone.current || skipSave.current) return;
      if (state.columns === prev.columns) return;
      scheduleSave(state.columns);
    });

    return () => {
      unsub();
      if (saveTimer.current) clearTimeout(saveTimer.current);
    };
  }, []);

  return null;
}
