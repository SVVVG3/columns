"use client";

import { useEffect, useRef } from "react";
import { remainingColumnSlots } from "@/lib/columnLimits";
import { useColumnsStore } from "@/store/columns";
import {
  columnsFromSharePayload,
  decodeShareParam,
  PENDING_COLUMN_KEY,
  PENDING_COLUMN_SHARE_ID_KEY,
  PENDING_LAYOUT_KEY,
} from "@/lib/layoutShare";

/** Append shared column(s) from URL after sign-in. */
export function LayoutImportHandler() {
  const columns = useColumnsStore((s) => s.columns);
  const addColumn = useColumnsStore((s) => s.addColumn);
  const applied = useRef(false);

  useEffect(() => {
    if (applied.current) return;

    const params = new URLSearchParams(window.location.search);
    const shareId =
      sessionStorage.getItem(PENDING_COLUMN_SHARE_ID_KEY) ?? params.get("c");
    const columnParam =
      sessionStorage.getItem(PENDING_COLUMN_KEY) ?? params.get("column");
    const layoutParam =
      sessionStorage.getItem(PENDING_LAYOUT_KEY) ?? params.get("layout");

    if (!shareId && !columnParam && !layoutParam) return;
    applied.current = true;

    (async () => {
      try {
        let payload;
        if (shareId) {
          const res = await fetch(
            `/api/share/column?id=${encodeURIComponent(shareId)}`
          );
          if (!res.ok) throw new Error("Share link not found or expired");
          payload = await res.json();
        } else {
          payload = decodeShareParam(columnParam ?? layoutParam!);
        }
        const toAdd = columnsFromSharePayload(payload, columns);
        const slots = remainingColumnSlots(columns.length);
        for (const col of toAdd.slice(0, slots)) addColumn(col);
      } catch (err) {
        console.error("[column import]", err);
      } finally {
        sessionStorage.removeItem(PENDING_COLUMN_SHARE_ID_KEY);
        sessionStorage.removeItem(PENDING_COLUMN_KEY);
        sessionStorage.removeItem(PENDING_LAYOUT_KEY);
        const clean = new URLSearchParams(window.location.search);
        clean.delete("c");
        clean.delete("column");
        clean.delete("layout");
        const qs = clean.toString();
        window.history.replaceState(
          {},
          "",
          window.location.pathname + (qs ? `?${qs}` : "")
        );
      }
    })();
  }, [columns, addColumn]);

  return null;
}
