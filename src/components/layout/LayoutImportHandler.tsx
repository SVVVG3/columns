"use client";

import { useEffect, useRef } from "react";
import { useColumnsStore } from "@/store/columns";
import {
  columnsFromSharePayload,
  decodeShareParam,
  PENDING_COLUMN_KEY,
  PENDING_LAYOUT_KEY,
} from "@/lib/layoutShare";

/** Append shared column(s) from URL after sign-in. */
export function LayoutImportHandler() {
  const columns = useColumnsStore((s) => s.columns);
  const addColumn = useColumnsStore((s) => s.addColumn);
  const applied = useRef(false);

  useEffect(() => {
    if (applied.current) return;

    const columnParam =
      sessionStorage.getItem(PENDING_COLUMN_KEY) ??
      new URLSearchParams(window.location.search).get("column");
    const layoutParam =
      sessionStorage.getItem(PENDING_LAYOUT_KEY) ??
      new URLSearchParams(window.location.search).get("layout");

    const param = columnParam ?? layoutParam;
    if (!param) return;
    applied.current = true;

    try {
      const payload = decodeShareParam(param);
      const toAdd = columnsFromSharePayload(payload, columns);
      for (const col of toAdd) addColumn(col);
    } catch (err) {
      console.error("[column import]", err);
    } finally {
      sessionStorage.removeItem(PENDING_COLUMN_KEY);
      sessionStorage.removeItem(PENDING_LAYOUT_KEY);
      const params = new URLSearchParams(window.location.search);
      params.delete("column");
      params.delete("layout");
      const qs = params.toString();
      window.history.replaceState(
        {},
        "",
        window.location.pathname + (qs ? `?${qs}` : "")
      );
    }
  }, [columns, addColumn]);

  return null;
}
