"use client";

import { useEffect } from "react";
import { PENDING_COLUMN_KEY, PENDING_LAYOUT_KEY } from "@/lib/layoutShare";

/** Persist ?column= or legacy ?layout= before auth redirect strips the URL. */
export function LayoutParamCapture() {
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const column = params.get("column");
    const layout = params.get("layout");

    if (column) sessionStorage.setItem(PENDING_COLUMN_KEY, column);
    if (layout) sessionStorage.setItem(PENDING_LAYOUT_KEY, layout);

    if (!column && !layout) return;

    params.delete("column");
    params.delete("layout");
    const qs = params.toString();
    const path = window.location.pathname + (qs ? `?${qs}` : "");
    window.history.replaceState({}, "", path);
  }, []);

  return null;
}
