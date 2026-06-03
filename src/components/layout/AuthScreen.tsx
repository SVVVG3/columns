"use client";

import { NeynarAuthButton, useNeynarContext } from "@neynar/react";
import Image from "next/image";
import { useEffect } from "react";
import { useRouter } from "next/navigation";
import columnsLogo from "../../../public/columns-logo.png";

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
          <div className="w-16 h-16 rounded-2xl overflow-hidden shrink-0">
            <Image
              src={columnsLogo}
              alt="Columns"
              width={64}
              height={64}
              className="object-cover w-full h-full"
              priority
            />
          </div>
          <div className="text-center">
            <h1 className="text-2xl font-bold text-white">Columns</h1>
            <p className="text-sm text-[var(--muted)] mt-1">
              Multi-Column Farcaster Desktop Client
            </p>
          </div>
        </div>

        {/* Sign in button */}
        <div className="w-full flex flex-col items-center gap-4">
          <div className="auth-screen-signin w-full">
            <NeynarAuthButton
              label="Sign in with Neynar"
              icon={<></>}
              className="columns-neynar-signin"
            />
          </div>
          <p className="text-xs text-[var(--muted)] text-center">
            Sign in with your Farcaster account to grant Columns permissions.
          </p>
        </div>
      </div>
    </div>
  );
}
