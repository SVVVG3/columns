"use client";

import { useRef, useState } from "react";
import { MAX_COLUMNS, useColumnsStore } from "@/store/columns";
import { remainingColumnSlots } from "@/lib/columnLimits";
import { columnsFromSharePayload, parseShareJson } from "@/lib/layoutShare";

interface ImportColumnModalProps {
  onClose: () => void;
}

export function ImportColumnModal({ onClose }: ImportColumnModalProps) {
  const columns = useColumnsStore((s) => s.columns);
  const addColumn = useColumnsStore((s) => s.addColumn);
  const fileRef = useRef<HTMLInputElement>(null);

  const [importText, setImportText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  function applyImport(raw: string) {
    setError(null);
    setSuccess(null);
    try {
      const payload = parseShareJson(raw.trim());
      const toAdd = columnsFromSharePayload(payload, columns);
      if (toAdd.length === 0) {
        throw new Error("Nothing to import (Home column already exists)");
      }
      const slots = remainingColumnSlots(columns.length);
      if (slots === 0) {
        throw new Error(`Maximum of ${MAX_COLUMNS} columns reached`);
      }
      const batch = toAdd.slice(0, slots);
      for (const col of batch) addColumn(col);
      if (batch.length < toAdd.length) {
        setSuccess(
          `Added ${batch.length} column${batch.length === 1 ? "" : "s"} (${MAX_COLUMNS} max — remove a column to import more)`
        );
      } else {
        setSuccess(
          batch.length === 1
            ? `Added column "${batch[0].title}"`
            : `Added ${batch.length} columns`
        );
      }
      setImportText("");
      setTimeout(onClose, 800);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Invalid column file");
    }
  }

  function handleFile(file: File) {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === "string") applyImport(reader.result);
    };
    reader.readAsText(file);
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center pt-16 bg-black/70 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="w-full max-w-lg max-h-[85vh] overflow-y-auto bg-[var(--surface)] border border-[var(--border)] rounded-2xl shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-4 pt-4 pb-2 border-b border-[var(--border)]">
          <h2 className="text-sm font-semibold text-[var(--foreground)]">Import column</h2>
          <button
            onClick={onClose}
            className="text-[var(--muted)] hover:text-[var(--foreground)] transition-colors p-1"
            aria-label="Close"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="p-4 space-y-3">
          <p className="text-xs text-[var(--muted)]">
            Paste JSON or upload a file from a shared column. New columns are added to the right of your board.
          </p>
          <textarea
            value={importText}
            onChange={(e) => setImportText(e.target.value)}
            placeholder='{"schemaVersion":3,"column":{...}}'
            rows={5}
            className="w-full px-3 py-2 rounded-lg border border-[var(--border)] bg-[var(--background)] text-xs text-[var(--foreground)] placeholder:text-[var(--muted)] resize-none outline-none focus:border-[var(--accent)] font-mono"
          />
          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => importText.trim() && applyImport(importText)}
              disabled={!importText.trim()}
              className="px-3 py-1.5 rounded-lg bg-[var(--accent)] hover:bg-[var(--accent-hover)] disabled:opacity-40 text-white text-xs font-medium transition-colors"
            >
              Add column
            </button>
            <button
              onClick={() => fileRef.current?.click()}
              className="px-3 py-1.5 rounded-lg border border-[var(--border)] text-xs text-[var(--foreground)] hover:bg-[var(--surface-hover)] transition-colors"
            >
              Upload file
            </button>
            <input
              ref={fileRef}
              type="file"
              accept="application/json,.json"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) handleFile(file);
                e.target.value = "";
              }}
            />
          </div>
          {error && <p className="text-xs text-red-400">{error}</p>}
          {success && <p className="text-xs text-green-400">{success}</p>}
        </div>
      </div>
    </div>
  );
}
