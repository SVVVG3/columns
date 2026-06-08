"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef } from "react";
import { sdk } from "@farcaster/miniapp-sdk";

/** In a Farcaster mini app host, `/` opens Columns (allowlisted) or profile. */
export function MiniAppHomeRedirect() {
  const pathname = usePathname();
  const router = useRouter();
  const didRedirect = useRef(false);

  useEffect(() => {
    if (didRedirect.current || pathname !== "/") return;

    void (async () => {
      const inMiniApp = await sdk.isInMiniApp();
      if (!inMiniApp) return;

      let dest = "/profile/me";
      try {
        const ctx = await sdk.context;
        const fid = ctx?.user?.fid;
        if (fid) {
          const res = await fetch(`/api/miniapp/columns-access?fid=${fid}`);
          if (res.ok) {
            const data = (await res.json()) as { allowed?: boolean };
            if (data.allowed) dest = "/columns";
          }
        }
      } catch {
        /* keep profile default */
      }

      didRedirect.current = true;
      router.replace(dest);
    })();
  }, [pathname, router]);

  return null;
}
