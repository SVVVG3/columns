"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef } from "react";
import { sdk } from "@farcaster/miniapp-sdk";

/** In a Farcaster mini app host, `/` always opens the Columns feed page. */
export function MiniAppHomeRedirect() {
  const pathname = usePathname();
  const router = useRouter();
  const didRedirect = useRef(false);

  useEffect(() => {
    if (didRedirect.current || pathname !== "/") return;

    void (async () => {
      const inMiniApp = await sdk.isInMiniApp();
      if (!inMiniApp) return;

      didRedirect.current = true;
      router.replace("/columns");
    })();
  }, [pathname, router]);

  return null;
}
