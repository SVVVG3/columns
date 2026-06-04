"use client";

import { useEffect } from "react";
import {
  PENDING_COLUMN_KEY,
  PENDING_COLUMN_SHARE_ID_KEY,
  PENDING_LAYOUT_KEY,
} from "@/lib/layoutShare";

/** Persist share params before auth redirect strips the URL. */
export function LayoutParamCapture() {
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const shortId = params.get("c");
    const column = params.get("column");
    const layout = params.get("layout");

    if (shortId) sessionStorage.setItem(PENDING_COLUMN_SHARE_ID_KEY, shortId);
    if (column) sessionStorage.setItem(PENDING_COLUMN_KEY, column);
    if (layout) sessionStorage.setItem(PENDING_LAYOUT_KEY, layout);

    if (!shortId && !column && !layout) return;

    params.delete("c");
    params.delete("column");
    params.delete("layout");
    const qs = params.toString();
    const path = window.location.pathname + (qs ? `?${qs}` : "");
    window.history.replaceState({}, "", path);
  }, []);

  return null;
}
