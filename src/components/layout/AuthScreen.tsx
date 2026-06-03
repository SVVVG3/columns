"use client";

import { NeynarAuthButton, useNeynarContext } from "@neynar/react";
import { useEffect } from "react";
import { useRouter } from "next/navigation";

export function AuthScreen() {
  const { user } = useNeynarContext();
  const router = useRouter();

  useEffect(() => {
    if (!user) return;

    // Persist session server-side via httpOnly cookie
    fetch("/api/auth/session", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        fid: user.fid,
        signerUuid: user.signer_uuid,
        username: user.username,
        displayName: user.display_name ?? user.username,
        pfpUrl: user.pfp_url ?? "",
      }),
    }).then(() => router.refresh());
  }, [user, router]);

  return (
    <div className="flex h-full items-center justify-center bg-black">
      <div className="flex flex-col items-center gap-8 max-w-sm w-full px-6">
        {/* Logo / wordmark */}
        <div className="flex flex-col items-center gap-3">
          <div className="w-14 h-14 rounded-2xl bg-[var(--accent)] flex items-center justify-center">
            <svg
              viewBox="0 0 1000 1000"
              className="w-8 h-8 fill-white"
              aria-hidden="true"
            >
              <path d="M257.778 155.556h484.444v688.889h-71.111V528.889H528.89l85.333 315.556h-71.111l-85.334-315.556H328.889v315.556h-71.111V155.556z" />
              <path d="M128.889 253.333L157.778 351.111H182.222V746.667C169.778 746.667 160 756.444 160 768.889V795.556H155.556C143.111 795.556 133.333 805.333 133.333 817.778V844.444H382.222V817.778C382.222 805.333 372.444 795.556 360 795.556H355.556V768.889C355.556 756.444 345.778 746.667 333.333 746.667H306.667V253.333H128.889ZM617.778 746.667C605.333 746.667 595.556 756.444 595.556 768.889V795.556H591.111C578.667 795.556 568.889 805.333 568.889 817.778V844.444H817.778V817.778C817.778 805.333 808 795.556 795.556 795.556H791.111V768.889C791.111 756.444 781.333 746.667 768.889 746.667V351.111H793.333L822.222 253.333H644.444V746.667H617.778Z" />
            </svg>
          </div>
          <div className="text-center">
            <h1 className="text-2xl font-bold text-white">Farcaster</h1>
            <p className="text-sm text-[var(--muted)] mt-1">
              Multi-column desktop client
            </p>
          </div>
        </div>

        {/* Sign in button */}
        <div className="w-full flex flex-col items-center gap-4">
          <NeynarAuthButton />
          <p className="text-xs text-[var(--muted)] text-center">
            Sign in with your Farcaster account using Warpcast or any compatible wallet.
          </p>
        </div>
      </div>
    </div>
  );
}
