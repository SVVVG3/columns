"use client";

import { useEffect } from "react";
import { sdk } from "@farcaster/miniapp-sdk";

/** Dismisses the Farcaster mini app splash on every route (home, profile, etc.). */
export function MiniAppReady() {
  useEffect(() => {
    void sdk.actions.ready().catch(() => {
      // Not running inside a mini app host — no-op in normal browser tabs.
    });
  }, []);

  return null;
}
