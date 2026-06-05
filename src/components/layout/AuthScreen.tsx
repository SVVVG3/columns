"use client";

import { NeynarAuthButton, useNeynarContext } from "@neynar/react";
import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import columnsLogo from "../../../public/columns-logo.png";
import farcasterLogoWhite from "../../../public/farcaster-logo-white.png";

interface AuthScreenProps {
  betaGateEnabled: boolean;
  betaUnlocked: boolean;
}

export function AuthScreen({
  betaGateEnabled: betaGateEnabledInitial,
  betaUnlocked: betaUnlockedInitial,
}: AuthScreenProps) {
  const { user } = useNeynarContext();
  const router = useRouter();
  const sessionAttemptedRef = useRef(false);

  const [betaGateEnabled, setBetaGateEnabled] = useState(betaGateEnabledInitial);
  const [betaUnlocked, setBetaUnlocked] = useState(
    betaUnlockedInitial || !betaGateEnabledInitial
  );
  const [password, setPassword] = useState("");
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [passwordLoading, setPasswordLoading] = useState(false);
  const [allowlistError, setAllowlistError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/auth/beta", { cache: "no-store" })
      .then((res) => (res.ok ? res.json() : null))
      .then((data: { enabled?: boolean; unlocked?: boolean } | null) => {
        if (!data) return;
        setBetaGateEnabled(!!data.enabled);
        setBetaUnlocked(!!data.unlocked || !data.enabled);
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (!user || allowlistError) return;
    if (sessionAttemptedRef.current) return;
    sessionAttemptedRef.current = true;

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
    })
      .then(async (res) => {
        if (!res.ok) {
          sessionAttemptedRef.current = false;
          const data = (await res.json().catch(() => ({}))) as {
            error?: string;
            fid?: number;
            username?: string;
          };
          if (data.error === "not_allowed") {
            const handle = data.username ? `@${data.username}` : "your account";
            setAllowlistError(
              `Columns is invite-only. You signed in as ${handle} (FID ${data.fid ?? user.fid}). Ask the team to add your FID to the allowlist.`
            );
            return;
          }
          if (data.error === "beta_required") {
            setBetaUnlocked(false);
            setPasswordError("Enter the beta password before signing in.");
            return;
          }
          setAllowlistError("Could not sign in. Please try again.");
          return;
        }
        router.refresh();
      })
      .catch(() => {
        sessionAttemptedRef.current = false;
        setAllowlistError("Could not sign in. Please try again.");
      });
  }, [user, router, allowlistError]);

  async function handleBetaSubmit(e: React.FormEvent) {
    e.preventDefault();
    setPasswordError(null);
    setPasswordLoading(true);
    try {
      const res = await fetch("/api/auth/beta", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });
      if (!res.ok) {
        setPasswordError("Incorrect password. Try again.");
        return;
      }
      setBetaUnlocked(true);
      setPassword("");
    } catch {
      setPasswordError("Something went wrong. Try again.");
    } finally {
      setPasswordLoading(false);
    }
  }

  const showSignIn = !betaGateEnabled || betaUnlocked;

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

        {allowlistError ? (
          <div className="w-full flex flex-col items-center gap-3">
            <p className="text-sm text-amber-200/90 text-center leading-relaxed">
              {allowlistError}
            </p>
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="text-xs text-[var(--muted)] hover:text-white underline"
            >
              Try a different account
            </button>
          </div>
        ) : showSignIn ? (
          <div className="w-full flex flex-col items-center gap-4">
            <div className="auth-screen-signin w-full">
              <NeynarAuthButton
                label="Sign in with Farcaster"
                icon={
                  <Image
                    src={farcasterLogoWhite}
                    alt=""
                    width={22}
                    height={22}
                    className="columns-signin-fc-logo"
                    aria-hidden
                  />
                }
                className="columns-neynar-signin"
              />
            </div>
            <p className="text-xs text-[var(--muted)] text-center">
              Sign in with your Farcaster account to grant Columns permissions.
            </p>
          </div>
        ) : (
          <form
            onSubmit={handleBetaSubmit}
            className="w-full flex flex-col items-center gap-4"
          >
            <p className="text-xs text-[var(--muted)] text-center">
              Columns is in private beta.
            </p>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Enter Invite Passcode"
              autoComplete="current-password"
              className="w-full rounded-xl border border-[var(--border)] bg-[var(--surface)] px-3 py-2.5 text-sm text-white placeholder:text-[var(--muted)] focus:outline-none focus:border-[var(--accent)]"
            />
            {passwordError && (
              <p className="text-xs text-red-400 text-center w-full">{passwordError}</p>
            )}
            <div className="auth-screen-signin w-full">
              <button type="submit" disabled={passwordLoading || !password.trim()}>
                {passwordLoading ? "Checking…" : "Continue"}
              </button>
            </div>
            <p className="text-xs text-[var(--muted)] text-center">
              Follow{" "}
              <a
                href="https://farcaster.xyz/~/channel/columns"
                target="_blank"
                rel="noopener noreferrer"
                className="text-[var(--accent)] hover:underline"
              >
                Columns
              </a>{" "}
              on Farcaster
            </p>
          </form>
        )}
      </div>
    </div>
  );
}
