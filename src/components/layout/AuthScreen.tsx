"use client";

import Image from "next/image";
import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { QRCodeSVG } from "qrcode.react";
import { COLUMNS_FARCASTER_MINIAPP_URL } from "@/lib/appUrl";
import columnsLogo from "../../../public/columns-logo.png";
import farcasterLogoWhite from "../../../public/farcaster-logo-white.png";

interface AuthScreenProps {
  betaGateEnabled: boolean;
  betaUnlocked: boolean;
}

interface PendingSigner {
  signer_uuid: string;
  status: string;
  signer_approval_url: string | null;
}

interface ApprovedSignerUser {
  fid: number;
  username: string;
  displayName: string;
  pfpUrl: string;
}

export function AuthScreen({
  betaGateEnabled: betaGateEnabledInitial,
  betaUnlocked: betaUnlockedInitial,
}: AuthScreenProps) {
  const router = useRouter();
  const sessionAttemptedRef = useRef(false);
  const pollIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const [betaGateEnabled, setBetaGateEnabled] = useState(betaGateEnabledInitial);
  const [betaUnlocked, setBetaUnlocked] = useState(
    betaUnlockedInitial || !betaGateEnabledInitial
  );
  const [password, setPassword] = useState("");
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [passwordLoading, setPasswordLoading] = useState(false);
  const [allowlistError, setAllowlistError] = useState<string | null>(null);

  const [signInLoading, setSignInLoading] = useState(false);
  const [signInError, setSignInError] = useState<string | null>(null);
  const [pendingSigner, setPendingSigner] = useState<PendingSigner | null>(null);

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

  const establishSession = useCallback(
    async (signerUuid: string, user: ApprovedSignerUser) => {
      if (sessionAttemptedRef.current) return;
      sessionAttemptedRef.current = true;

      try {
        const res = await fetch("/api/auth/session", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            fid: user.fid,
            signerUuid,
            username: user.username,
            displayName: user.displayName,
            pfpUrl: user.pfpUrl,
          }),
        });

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
            setPendingSigner(null);
            return;
          }
          if (data.error === "beta_required") {
            setBetaUnlocked(false);
            setPasswordError("Enter the beta password before signing in.");
            setPendingSigner(null);
            return;
          }
          setSignInError("Could not sign in. Please try again.");
          return;
        }

        router.refresh();
      } catch {
        sessionAttemptedRef.current = false;
        setSignInError("Could not sign in. Please try again.");
      }
    },
    [router]
  );

  const pollSigner = useCallback(
    async (signerUuid: string) => {
      try {
        const res = await fetch(
          `/api/auth/signer?signer_uuid=${encodeURIComponent(signerUuid)}`,
          { cache: "no-store" }
        );
        if (!res.ok) return;

        const data = (await res.json()) as {
          status?: string;
          fid?: number | null;
          user?: ApprovedSignerUser;
        };

        if (data.status === "approved" && data.fid && data.user) {
          if (pollIntervalRef.current) {
            clearInterval(pollIntervalRef.current);
            pollIntervalRef.current = null;
          }
          await establishSession(signerUuid, data.user);
        }
      } catch {
        // keep polling
      }
    },
    [establishSession]
  );

  useEffect(() => {
    if (!pendingSigner?.signer_uuid) return;

    const signerUuid = pendingSigner.signer_uuid;

    const startPolling = () => {
      if (pollIntervalRef.current) return;
      void pollSigner(signerUuid);
      pollIntervalRef.current = setInterval(() => {
        void pollSigner(signerUuid);
      }, 2000);
    };

    const stopPolling = () => {
      if (pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current);
        pollIntervalRef.current = null;
      }
    };

    const onVisibility = () => {
      if (document.hidden) stopPolling();
      else startPolling();
    };

    document.addEventListener("visibilitychange", onVisibility);
    startPolling();

    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      stopPolling();
    };
  }, [pendingSigner, pollSigner]);

  async function handleSignIn() {
    setSignInError(null);
    setSignInLoading(true);
    sessionAttemptedRef.current = false;

    try {
      const res = await fetch("/api/auth/signer", { method: "POST" });
      const data = (await res.json().catch(() => ({}))) as {
        signer_uuid?: string;
        status?: string;
        signer_approval_url?: string | null;
        error?: string;
        message?: string;
      };

      if (!res.ok) {
        if (data.error === "signer_not_configured") {
          setSignInError(
            "Columns sign-in is not configured on the server. Contact the team."
          );
        } else {
          setSignInError("Could not start sign-in. Please try again.");
        }
        return;
      }

      if (!data.signer_uuid) {
        setSignInError("Could not start sign-in. Please try again.");
        return;
      }

      setPendingSigner({
        signer_uuid: data.signer_uuid,
        status: data.status ?? "pending_approval",
        signer_approval_url: data.signer_approval_url ?? null,
      });
    } catch {
      setSignInError("Could not start sign-in. Please try again.");
    } finally {
      setSignInLoading(false);
    }
  }

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
            {pendingSigner?.signer_approval_url ? (
              <div className="w-full flex flex-col items-center gap-4">
                <p className="text-sm text-white text-center">
                  Approve Columns in Farcaster to finish signing in.
                </p>

                {/* Desktop: show QR code to scan with phone */}
                <div className="hidden sm:flex flex-col items-center gap-3">
                  <div className="rounded-xl bg-white p-3">
                    <QRCodeSVG value={pendingSigner.signer_approval_url} size={180} />
                  </div>
                  <p className="text-xs text-[var(--muted)] text-center">
                    Scan with your phone's camera or Farcaster app
                  </p>
                </div>

                {/* Mobile: tap-to-open button (QR isn't useful on the same device) */}
                <a
                  href={pendingSigner.signer_approval_url}
                  className="sm:hidden w-full flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-[var(--accent)] text-white text-sm font-semibold text-center"
                >
                  <Image
                    src={farcasterLogoWhite}
                    alt=""
                    width={18}
                    height={18}
                    className="object-contain shrink-0"
                    aria-hidden
                  />
                  Open in Farcaster to approve
                </a>

                <p className="text-xs text-[var(--muted)] text-center">
                  Waiting for approval…
                </p>
                <button
                  type="button"
                  onClick={() => {
                    setPendingSigner(null);
                    setSignInError(null);
                    sessionAttemptedRef.current = false;
                  }}
                  className="text-xs text-[var(--muted)] hover:text-white underline"
                >
                  Cancel
                </button>
              </div>
            ) : (
              <div className="auth-screen-signin w-full">
                <button
                  type="button"
                  onClick={handleSignIn}
                  disabled={signInLoading}
                  className="columns-managed-signin"
                >
                  <Image
                    src={farcasterLogoWhite}
                    alt=""
                    width={22}
                    height={22}
                    className="columns-signin-fc-logo"
                    aria-hidden
                  />
                  <span>
                    {signInLoading ? "Starting sign-in…" : "Sign in with Farcaster"}
                  </span>
                </button>
              </div>
            )}
            {signInError && (
              <p className="text-xs text-red-400 text-center w-full">{signInError}</p>
            )}
            {!pendingSigner && (
              <p className="text-xs text-[var(--muted)] text-center">
                Sign in with your Farcaster account to grant Columns permissions.
              </p>
            )}
          </div>
        ) : (
          <form
            onSubmit={handleBetaSubmit}
            className="w-full flex flex-col items-center gap-4"
          >
            <p className="text-xs text-[var(--muted)] text-center leading-relaxed">
              Columns is in private beta.{" "}
              Try our{" "}
              <a
                href={COLUMNS_FARCASTER_MINIAPP_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="text-[var(--accent)] hover:underline"
              >
                Mini App
              </a>{" "}
              on Farcaster!
            </p>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Enter Invite Passcode"
              autoComplete="current-password"
              className="w-full rounded-xl border border-[var(--border)] bg-[var(--surface)] px-3 py-2.5 text-sm text-center text-white placeholder:text-[var(--muted)] focus:outline-none focus:border-[var(--accent)]"
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
