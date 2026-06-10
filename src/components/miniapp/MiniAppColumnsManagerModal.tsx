"use client";

import { useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useState } from "react";
import { AddColumnModal } from "@/components/feed/AddColumnModal";
import { MiniAppProUpsellModal } from "@/components/miniapp/MiniAppProUpsellModal";
import { extractCustomColumns, maxCustomColumnsForUser } from "@/lib/miniappColumns";
import { miniappFetch } from "@/lib/miniappFetch";
import type { FeedColumnConfig } from "@/types";

const SCHEMA_VERSION = 3;

interface MiniAppColumnsManagerModalProps {
  open: boolean;
  onClose: () => void;
  isPro: boolean;
  viewerFid?: number;
  savedColumns: FeedColumnConfig[];
  followColumnsUrl: string;
  communityUrl: string;
  onLayoutSaved?: () => void;
}

async function saveCustomColumns(columns: FeedColumnConfig[]): Promise<boolean> {
  const res = await miniappFetch("/api/layout", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ schemaVersion: SCHEMA_VERSION, columns }),
  });
  return res.ok;
}

export function MiniAppColumnsManagerModal({
  open,
  onClose,
  isPro,
  viewerFid,
  savedColumns,
  followColumnsUrl,
  communityUrl,
  onLayoutSaved,
}: MiniAppColumnsManagerModalProps) {
  const queryClient = useQueryClient();
  const [customColumns, setCustomColumns] = useState<FeedColumnConfig[]>([]);
  const [addOpen, setAddOpen] = useState(false);
  const [editColumn, setEditColumn] = useState<FeedColumnConfig | undefined>();
  const [saving, setSaving] = useState(false);
  const [upsellOpen, setUpsellOpen] = useState(false);
  const maxCustom = maxCustomColumnsForUser(isPro);

  useEffect(() => {
    if (open) {
      setCustomColumns(extractCustomColumns(savedColumns));
    }
  }, [open, savedColumns]);

  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !addOpen) onClose();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [open, onClose, addOpen]);

  const persist = useCallback(
    async (nextCustom: FeedColumnConfig[]) => {
      setSaving(true);
      try {
        const ok = await saveCustomColumns(nextCustom);
        if (ok) {
          await queryClient.invalidateQueries({ queryKey: ["miniapp-layout"] });
          onLayoutSaved?.();
        }
      } finally {
        setSaving(false);
      }
    },
    [queryClient, onLayoutSaved]
  );

  function handleAddClick() {
    if (customColumns.length >= maxCustom) {
      if (!isPro) setUpsellOpen(true);
      return;
    }
    setEditColumn(undefined);
    setAddOpen(true);
  }

  function handleSaveColumn(column: FeedColumnConfig, mode: "add" | "edit") {
    let next: FeedColumnConfig[];
    if (mode === "edit") {
      next = customColumns.map((c) => (c.id === column.id ? column : c));
    } else {
      if (customColumns.length >= maxCustom) return;
      next = [...customColumns, column];
    }
    setCustomColumns(next);
    setAddOpen(false);
    void persist(next);
  }

  function handleDelete(id: string) {
    const next = customColumns.filter((c) => c.id !== id);
    setCustomColumns(next);
    void persist(next);
  }

  function moveColumn(id: string, direction: -1 | 1) {
    const idx = customColumns.findIndex((c) => c.id === id);
    if (idx < 0) return;
    const target = idx + direction;
    if (target < 0 || target >= customColumns.length) return;
    const next = [...customColumns];
    [next[idx], next[target]] = [next[target], next[idx]];
    setCustomColumns(next);
    void persist(next);
  }

  if (!open) return null;

  return (
    <>
      <div
        className="fixed inset-0 z-[85] flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-sm px-4 pb-6 sm:pb-0"
        onClick={onClose}
      >
        <div
          className="w-full max-w-sm bg-[var(--surface)] border border-[var(--border)] rounded-2xl shadow-2xl flex flex-col max-h-[85vh]"
          onClick={(e) => e.stopPropagation()}
          role="dialog"
          aria-label="Manage columns"
        >
          <div className="flex items-center justify-between px-4 pt-4 pb-3 border-b border-[var(--border)] shrink-0">
            <h2 className="text-sm font-semibold text-[var(--foreground)]">My Columns</h2>
            <button
              type="button"
              onClick={onClose}
              className="text-[var(--muted)] hover:text-[var(--foreground)]"
              aria-label="Close"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          <div className="overflow-y-auto flex-1 min-h-0 px-4 py-3 space-y-2">
            <div className="flex items-center gap-2 px-3 py-2.5 rounded-xl border border-[var(--border)] bg-[var(--background)] opacity-70">
              <span className="text-sm font-medium text-[var(--foreground)] flex-1">Home Feed</span>
              <span className="text-[10px] text-[var(--muted)]">Always on</span>
            </div>

            {customColumns.length === 0 ? (
              <p className="text-xs text-[var(--muted)] text-center py-4">
                {isPro
                  ? "Add a custom column to personalize your feed."
                  : "Free users can add 1 custom column alongside Home."}
              </p>
            ) : (
              customColumns.map((col, idx) => (
                <div
                  key={col.id}
                  className="flex items-center gap-2 px-3 py-2.5 rounded-xl border border-[var(--border)] bg-[var(--background)]"
                >
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-[var(--foreground)] truncate">{col.title}</p>
                    <p className="text-[10px] text-[var(--muted)] capitalize">{col.type}</p>
                  </div>
                  <div className="flex items-center gap-0.5 shrink-0">
                    <button
                      type="button"
                      disabled={idx === 0 || saving}
                      onClick={() => moveColumn(col.id, -1)}
                      className="p-1.5 text-[var(--muted)] hover:text-[var(--foreground)] disabled:opacity-30"
                      aria-label="Move up"
                    >
                      ↑
                    </button>
                    <button
                      type="button"
                      disabled={idx === customColumns.length - 1 || saving}
                      onClick={() => moveColumn(col.id, 1)}
                      className="p-1.5 text-[var(--muted)] hover:text-[var(--foreground)] disabled:opacity-30"
                      aria-label="Move down"
                    >
                      ↓
                    </button>
                    <button
                      type="button"
                      disabled={saving}
                      onClick={() => {
                        setEditColumn(col);
                        setAddOpen(true);
                      }}
                      className="p-1.5 text-[var(--muted)] hover:text-[var(--foreground)]"
                      aria-label="Edit"
                    >
                      ✎
                    </button>
                    <button
                      type="button"
                      disabled={saving}
                      onClick={() => handleDelete(col.id)}
                      className="p-1.5 text-[var(--muted)] hover:text-red-400"
                      aria-label="Delete"
                    >
                      ×
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>

          <div className="px-4 pb-4 pt-2 border-t border-[var(--border)] shrink-0 space-y-2">
            {customColumns.length >= maxCustom && !isPro && (
              <p className="text-[11px] text-amber-200/90 text-center">
                Upgrade to Columns Pro for up to 10 custom columns.
              </p>
            )}
            <button
              type="button"
              onClick={handleAddClick}
              disabled={saving || (customColumns.length >= maxCustom && isPro)}
              className="w-full py-2.5 rounded-xl bg-[var(--accent)] hover:bg-[var(--accent-hover)] disabled:opacity-40 text-white text-sm font-medium transition-colors"
            >
              {customColumns.length >= maxCustom
                ? isPro
                  ? `Maximum ${maxCustom} custom columns`
                  : "Add column (Pro)"
                : "+ Add column"}
            </button>
            {!isPro && customColumns.length < maxCustom && (
              <button
                type="button"
                onClick={() => setUpsellOpen(true)}
                className="w-full py-1.5 text-xs text-[var(--accent)] hover:underline"
              >
                Learn about Columns Pro →
              </button>
            )}
          </div>
        </div>
      </div>

      {addOpen && (
        <AddColumnModal
          onClose={() => {
            setAddOpen(false);
            setEditColumn(undefined);
          }}
          editColumn={editColumn}
          miniAppMode={{
            existingColumns: customColumns,
            maxColumns: maxCustom,
            excludeTypes: ["home"],
            onSave: handleSaveColumn,
          }}
        />
      )}

      <MiniAppProUpsellModal
        open={upsellOpen}
        onClose={() => setUpsellOpen(false)}
        viewerFid={viewerFid}
        followColumnsUrl={followColumnsUrl}
        communityUrl={communityUrl}
        featureTitle="More columns with Columns Pro"
        featureDescription="Free users get Home plus 1 custom column. Pro unlocks up to 10 custom columns, search, and the full desktop experience."
      />
    </>
  );
}
