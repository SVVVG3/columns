"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef } from "react";
import { sdk } from "@farcaster/miniapp-sdk";

/** In a Farcaster mini app host, opening `/` goes straight to the viewer's profile. */
export function MiniAppHomeRedirect() {
  const pathname = usePathname();
  const router = useRouter();
  const didRedirect = useRef(false);

  useEffect(() => {
    if (didRedirect.current || pathname !== "/") return;

    void (async () => {
      try {
        await sdk.context;
        didRedirect.current = true;
        router.replace("/profile/me");
      } catch {
        // Normal browser tab — keep the full Columns home experience.
      }
    })();
  }, [pathname, router]);

  return null;
}
