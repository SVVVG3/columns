"use client";

import Image from "next/image";
import { useEffect, useState } from "react";
import type { SpaceData } from "@/app/api/space/route";

interface MentionedProfile {
  fid: number;
  username: string;
  display_name?: string;
  pfp_url?: string;
}

interface SpaceCardProps {
  url: string;
  mentionedProfiles?: MentionedProfile[];
  castAuthorFid?: number;
}

function inferHostFromMentions(
  profiles: MentionedProfile[],
  castAuthorFid?: number
): MentionedProfile | undefined {
  const candidates = profiles.filter((p) => p.fid !== castAuthorFid);
  return candidates[candidates.length - 1] ?? profiles[0];
}

export function SpaceCard({ url, mentionedProfiles = [], castAuthorFid }: SpaceCardProps) {
  const [space, setSpace] = useState<SpaceData | null>(null);

  const fallbackHost = inferHostFromMentions(mentionedProfiles, castAuthorFid);
  const hostFidHint = fallbackHost?.fid;

  useEffect(() => {
    let cancelled = false;
    const params = new URLSearchParams({ url });
    if (hostFidHint) params.set("hostFid", String(hostFidHint));
    fetch(`/api/space?${params}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (!cancelled && data) setSpace(data);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [url, hostFidHint]);

  const loading = space === null;
  const host =
    space?.host ??
    (fallbackHost
      ? {
          fid: fallbackHost.fid,
          username: fallbackHost.username,
          display_name: fallbackHost.display_name ?? fallbackHost.username,
          pfp_url: fallbackHost.pfp_url,
        }
      : undefined);

  const title = space?.title ?? (loading ? "" : "Audio Space");
  const isLive = space?.isLive ?? false;
  const listeners = space?.participantCount;

  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      onClick={(e) => e.stopPropagation()}
      className="mt-2 block rounded-2xl overflow-hidden border border-[var(--border)] hover:border-[var(--accent)]/40 transition-colors"
    >
      <div
        className="relative px-4 py-3.5"
        style={{
          background:
            "linear-gradient(135deg, rgba(88, 28, 135, 0.35) 0%, rgba(24, 24, 27, 0.95) 55%, rgba(9, 9, 11, 1) 100%)",
        }}
      >
        <div className="flex items-center gap-2 mb-2">
          {isLive ? (
            <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-red-600/90 text-[10px] font-bold uppercase tracking-wide text-white">
              <span className="w-1.5 h-1.5 rounded-full bg-white animate-pulse" />
              Live
            </span>
          ) : loading ? (
            <span className="inline-block h-4 w-12 rounded-full bg-white/10 animate-pulse" />
          ) : null}
          <span className="text-xs text-[var(--muted)]">Space</span>
        </div>

        {loading ? (
          <div className="h-5 w-40 rounded bg-white/10 animate-pulse mb-3" />
        ) : (
          <h3 className="text-base font-semibold text-[var(--foreground)] leading-snug mb-3 line-clamp-2">
            {title}
          </h3>
        )}

        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 min-w-0">
            {host?.pfp_url ? (
              <Image
                src={host.pfp_url}
                alt={host.display_name}
                width={28}
                height={28}
                className="rounded-full shrink-0"
                unoptimized
              />
            ) : (
              <div className="w-7 h-7 rounded-full bg-[var(--surface-hover)] shrink-0" />
            )}
            <div className="min-w-0">
              {host ? (
                <p className="text-xs text-[var(--muted)] truncate">
                  <span className="text-[var(--foreground)] font-medium">
                    {host.display_name}
                  </span>
                  <span> · hosting</span>
                </p>
              ) : loading ? (
                <div className="h-3 w-28 rounded bg-white/10 animate-pulse" />
              ) : null}
              {listeners !== undefined && listeners > 0 && (
                <p className="text-[11px] text-[var(--muted)] flex items-center gap-1 mt-0.5">
                  <svg className="w-3 h-3 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={1.5}
                      d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z"
                    />
                  </svg>
                  {listeners} listening
                </p>
              )}
            </div>
          </div>

          <span className="shrink-0 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[var(--accent)] text-white text-xs font-semibold hover:opacity-90 transition-opacity">
            <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 24 24">
              <path d="M12 14c1.66 0 3-1.34 3-3V5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3zm-1-9c0-.55.45-1 1-1s1 .45 1 1v6c0 .55-.45 1-1 1s-1-.45-1-1V5zm6 6c0 2.76-2.24 5-5 5s-5-2.24-5-5H5c0 3.53 2.61 6.43 6 6.92V21h2v-2.08c3.39-.49 6-3.39 6-6.92h-2z" />
            </svg>
            Join
          </span>
        </div>
      </div>
    </a>
  );
}
