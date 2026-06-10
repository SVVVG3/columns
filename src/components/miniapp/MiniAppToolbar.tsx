"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { sdk } from "@farcaster/miniapp-sdk";
import { MiniAppColumnsManagerModal } from "@/components/miniapp/MiniAppColumnsManagerModal";
import { MiniAppProUpsellModal } from "@/components/miniapp/MiniAppProUpsellModal";
import { ProfileSearchModal } from "@/components/search/ProfileSearchModal";
import { miniappFetch } from "@/lib/miniappFetch";
import type { FeedColumnConfig } from "@/types";
import columnsLogo from "../../../public/columns-logo.png";

interface MiniAppToolbarProps {
  /** Viewer's profile picture URL — shown as the right-most avatar button. */
  viewerPfp?: string | null;
  viewerFid?: number;
  isPro?: boolean;
  followColumnsUrl: string;
  communityUrl: string;
  activePage?: "columns" | "profile" | "settings";
  /** Pre-loaded layout from the columns page; fetched on demand when omitted. */
  savedColumns?: FeedColumnConfig[];
}

async function fetchLayout(): Promise<FeedColumnConfig[]> {
  const res = await miniappFetch("/api/layout", { cache: "no-store" });
  if (!res.ok) return [];
  const data = (await res.json()) as { layout?: { columns?: FeedColumnConfig[] } | null };
  return data.layout?.columns ?? [];
}

export function MiniAppToolbar({
  viewerPfp,
  viewerFid,
  isPro = false,
  followColumnsUrl,
  communityUrl,
  activePage,
  savedColumns: savedColumnsProp,
}: MiniAppToolbarProps) {
  const router = useRouter();
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchUpsellOpen, setSearchUpsellOpen] = useState(false);
  const [managerOpen, setManagerOpen] = useState(false);

  const { data: fetchedColumns = [] } = useQuery({
    queryKey: ["miniapp-layout", viewerFid],
    queryFn: fetchLayout,
    enabled: managerOpen && savedColumnsProp === undefined && viewerFid != null,
    staleTime: 30_000,
  });

  const savedColumns = savedColumnsProp ?? fetchedColumns;

  useEffect(() => {
    router.prefetch("/columns");
    router.prefetch("/profile/me");
    router.prefetch("/settings");
  }, [router]);

  function handleSearchClick() {
    if (isPro) setSearchOpen(true);
    else setSearchUpsellOpen(true);
  }

  function handleSelectUser(username: string) {
    router.push(`/profile/${encodeURIComponent(username)}`);
  }

  function handleSelectCast(hash: string) {
    const normalized = hash.startsWith("0x") ? hash : `0x${hash}`;
    void sdk.actions.viewCast({ hash: normalized }).catch(() => {});
  }

  const iconBtn =
    "w-[52px] h-[52px] flex items-center justify-center rounded-full hover:bg-[var(--surface-hover)] text-[var(--muted)] hover:text-[var(--foreground)] transition-colors shrink-0";

  return (
    <>
      <div className="shrink-0 border-t border-[var(--border)] bg-[var(--background)] py-3 max-w-lg mx-auto w-full">
        {/* Single centered row — avoids 1fr grid gaps that balloon on iPad */}
        <div className="flex items-center justify-center gap-[1.875rem] sm:gap-9 px-6">
          <Link
            href="/settings"
            className={`${iconBtn} ${
              activePage === "settings"
                ? "bg-[var(--surface-hover)] text-[var(--foreground)]"
                : ""
            }`}
            aria-label="Settings"
          >
            <svg className="w-7 h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={1.75}
                d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"
              />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
          </Link>

          <button
            type="button"
            onClick={handleSearchClick}
            className={iconBtn}
            aria-label="Search"
          >
            <svg className="w-7 h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
          </button>

          <Link
            href="/columns"
            className={`shrink-0 flex items-center justify-center transition-transform ${
              activePage === "columns" ? "scale-105" : "hover:scale-105"
            }`}
            aria-label="My Columns"
          >
            <Image
              src={columnsLogo}
              alt="Columns"
              width={52}
              height={52}
              className="w-[52px] h-[52px] rounded-xl object-cover"
            />
          </Link>

          <button
            type="button"
            onClick={() => setManagerOpen(true)}
            className={iconBtn}
            aria-label="Manage columns"
          >
            <svg className="w-7 h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M12 4v16m8-8H4" />
            </svg>
          </button>

          <Link
            href="/profile/me"
            className={`w-[52px] h-[52px] flex items-center justify-center rounded-full transition-colors shrink-0 ${
              activePage === "profile"
                ? "ring-2 ring-[var(--brand)] ring-offset-2 ring-offset-[var(--background)]"
                : "hover:opacity-80"
            }`}
            aria-label="My Profile"
          >
            {viewerPfp ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={viewerPfp}
                alt=""
                width={48}
                height={48}
                className="w-12 h-12 rounded-full object-cover"
              />
            ) : (
              <div className="w-12 h-12 rounded-full bg-[var(--surface-hover)]" />
            )}
          </Link>
        </div>
      </div>

      <ProfileSearchModal
        open={searchOpen}
        onClose={() => setSearchOpen(false)}
        onSelectUser={handleSelectUser}
        onSelectCast={handleSelectCast}
      />

      <MiniAppProUpsellModal
        open={searchUpsellOpen}
        onClose={() => setSearchUpsellOpen(false)}
        viewerFid={viewerFid}
        followColumnsUrl={followColumnsUrl}
        communityUrl={communityUrl}
        featureTitle="Search is a Columns Pro feature"
        featureDescription="Search profiles, casts, FIDs, wallets, and X handles across Farcaster. Join the waitlist to get early access."
      />

      <MiniAppColumnsManagerModal
        open={managerOpen}
        onClose={() => setManagerOpen(false)}
        isPro={isPro}
        viewerFid={viewerFid}
        savedColumns={savedColumns}
        followColumnsUrl={followColumnsUrl}
        communityUrl={communityUrl}
      />
    </>
  );
}
