"use client";

import Image from "next/image";
import dynamic from "next/dynamic";
import { useState, useRef, useEffect } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { ComposeModal } from "@/components/cast/ComposeModal";
import { ReplyModal } from "@/components/cast/ReplyModal";
import { ImageLightbox } from "@/components/ui/ImageLightbox";
import { profileSeedFromUnknown } from "@/lib/profilePreview";
import { useUiStore } from "@/store/ui";
import { useQuotedCast } from "@/hooks/useQuotedCast";
import { isQuotedCastSeed } from "@/lib/castLookup";
import { isSpaceEmbedUrl } from "@/lib/spaceEmbed";
import {
  collectTokenEmbedUrls,
  isEip155EmbedUri,
  isSameTokenUrl,
  isTokenEmbedUrl,
  parseTokenParentUrl,
} from "@/lib/tokenEmbed";
import { isImageEmbedUrl } from "@/lib/castEmbedMedia";
import { isMiniAppUrl, ogSeedFromEmbed } from "@/lib/ogLookup";
import { castConversationUrl, isSnapEmbedUrl, normalizeSnapUrl } from "@/lib/snapEmbed";
import { SnapCard } from "@/components/cast/SnapCard";
import { useOgMetadata } from "@/hooks/useOgMetadata";
import { SpaceCard } from "@/components/cast/SpaceCard";
import { MiniAppFrameCard } from "@/components/cast/MiniAppFrameCard";
import { TokenCard } from "@/components/cast/TokenCard";
import { UserAvatar } from "@/components/ui/UserAvatar";
import { channelColumnFromSlug, columnHasChannel } from "@/lib/channelColumn";
import { formatChannelLabel } from "@/lib/channelDisplay";
import { channelSlugFromCast } from "@/lib/castChannel";
import { useColumnsStore } from "@/store/columns";

// Load VideoPlayer client-only — hls.js requires browser APIs unavailable during SSR
const VideoPlayer = dynamic(
  () => import("@/components/cast/VideoPlayer").then((m) => m.VideoPlayer),
  { ssr: false }
);

interface CastCardProps {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  cast: any;
  viewerFid: number;
  /** Hash of the root cast of the conversation this card lives in (if any). Used to bust the conversation cache after a reply. */
  threadRootHash?: string;
  /** Compact card for profile top-casts, etc. — full embeds, rounded border instead of feed divider. */
  variant?: "feed" | "embedded";
}

// ─── Embed classification ─────────────────────────────────────────────────────
interface Embed {
  url?: string;
  cast_id?: unknown;
  metadata?: {
    content_type?: string;
    html?: {
      ogTitle?: string;
      ogDescription?: string;
      ogImage?: Array<{ url: string }>;
      oembed?: {
        type?: string;
        author_name?: string;
        author_url?: string;
        html?: string;
        thumbnail_url?: string;
      };
    };
    frames?: unknown[];
    miniapp?: unknown;
  };
}

// Frame data from cast.frames[] (top-level on the cast object, v1 Frames only)
interface CastFrame {
  image?: string;
  title?: string;
  frames_url?: string;
  image_aspect_ratio?: string;
  buttons?: Array<{ index: number; title: string; action_type: string; target?: string }>;
}

/** Known mini app / frame URL patterns (fallback when not in cast.frames) */

/** Hypersnap returns hashes without 0x; farcaster.xyz requires it. */
function withHexPrefix(hash: string): string {
  return hash.startsWith("0x") ? hash : `0x${hash}`;
}

// ─── Cast text renderer: @mentions + https:// URLs + /channels ───────────────
// NOTE: the regex is created inside the function (not at module level) to avoid
// concurrent renders sharing the `lastIndex` state of a global `g` flag regex.
function renderCastText(
  text: string,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  mentionedProfiles: any[],
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  mentionedChannels?: any[],
  /** URLs that already have an embed card — omit them from inline text */
  embedUrlSet?: Set<string>,
  /** Token URLs rendered as TokenCard — suppress inline link even if not in embedUrlSet */
  tokenUrls?: string[],
  onProfileMentionClick?: (username: string) => void
): React.ReactNode[] {
  const knownUsernames = new Set<string>(
    (mentionedProfiles ?? []).map((u: { username: string }) => u.username)
  );
  const knownChannelIds = new Set<string>(
    (mentionedChannels ?? []).map((c: { id: string }) => c.id)
  );

  // Matches @mentions, https:// URLs, and /channel-slug tokens.
  // Channel pattern uses a negative lookbehind to require whitespace (or start
  // of string) before the slash, avoiding matches inside URLs or "and/or" text.
  const TOKEN_RE = /@[\w.]+|https?:\/\/[^\s]+|(?<![^\s])\/[a-z][a-z0-9-]*/g;

  const nodes: React.ReactNode[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = TOKEN_RE.exec(text)) !== null) {
    const [full] = match;
    if (match.index > lastIndex) {
      nodes.push(text.slice(lastIndex, match.index));
    }

    if (full.startsWith("@")) {
      const username = full.slice(1);
      if (knownUsernames.has(username)) {
        nodes.push(
          <button
            key={match.index}
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onProfileMentionClick?.(username);
            }}
            className="text-[var(--accent)] hover:underline focus:outline-none"
          >
            {full}
          </button>
        );
      } else {
        nodes.push(full);
      }
    } else if (full.startsWith("/")) {
      const slug = full.slice(1);
      if (knownChannelIds.has(slug)) {
        nodes.push(
          <a
            key={match.index}
            href={`https://farcaster.xyz/~/channel/${slug}`}
            target="_blank"
            rel="noopener noreferrer"
            onClick={(e) => e.stopPropagation()}
            className="text-[var(--accent)] hover:underline"
          >
            {full}
          </a>
        );
      } else {
        nodes.push(full);
      }
    } else {
      // Strip trailing punctuation (e.g. "https://x.com/foo." at end of sentence)
      const cleanUrl = full.replace(/[.,!?)\]]+$/, "");
      const trailing = full.slice(cleanUrl.length);
      // Skip URLs that already have an embed card below — avoid duplication
      if (
        embedUrlSet?.has(cleanUrl) ||
        (tokenUrls?.length && isSameTokenUrl(cleanUrl, tokenUrls))
      ) {
        // drop silently; the card below is the canonical representation
      } else {
        nodes.push(
          <a
            key={match.index}
            href={cleanUrl}
            target="_blank"
            rel="noopener noreferrer"
            onClick={(e) => e.stopPropagation()}
            className="text-[var(--accent)] hover:underline break-all"
          >
            {cleanUrl}
          </a>
        );
        if (trailing) nodes.push(trailing);
      }
    }

    lastIndex = match.index + full.length;
  }

  if (lastIndex < text.length) {
    nodes.push(text.slice(lastIndex));
  }

  return nodes;
}

function isImageEmbed(e: Embed): boolean {
  return isImageEmbedUrl(e.url ?? "", e.metadata?.content_type);
}

function isVideoEmbed(e: Embed): boolean {
  const url = e.url ?? "";
  if (!url) return false;
  // Direct video files
  if (/\.(mp4|webm|mov|ogg|m3u8)(\?.*)?$/i.test(url)) return true;
  // Farcaster's HLS video CDN
  if (/stream\.farcaster\.xyz/i.test(url)) return true;
  // YouTube
  if (/youtube\.com\/watch|youtu\.be\//i.test(url)) return true;
  // content_type hint
  if (e.metadata?.content_type?.startsWith("video/")) return true;
  return false;
}

/** Fuzzy URL match — strip query params and trailing slash before comparing */
function normalizeUrl(url: string): string {
  try {
    const u = new URL(url);
    return `${u.origin}${u.pathname}`.replace(/\/$/, "");
  } catch {
    return url;
  }
}

function isFrameEmbed(e: Embed, castFrameUrls: Set<string>): boolean {
  if (!e.url) return false;
  if (castFrameUrls.has(normalizeUrl(e.url))) return true;
  if (isMiniAppUrl(e.url)) return true;
  if (Array.isArray(e.metadata?.frames) && (e.metadata.frames as unknown[]).length > 0) return true;
  if (e.metadata?.miniapp) return true;
  return false;
}


// ─── Component ────────────────────────────────────────────────────────────────
export function CastCard({ cast, viewerFid, threadRootHash, variant = "feed" }: CastCardProps) {
  const embedded = variant === "embedded";
  const queryClient = useQueryClient();
  const { openConversation, openProfilePreview } = useUiStore();
  const columns = useColumnsStore((s) => s.columns);
  const addColumn = useColumnsStore((s) => s.addColumn);
  const castChannelSlug = channelSlugFromCast(cast as Record<string, unknown>);
  const [replyOpen, setReplyOpen] = useState(false);
  const [quoteComposeOpen, setQuoteComposeOpen] = useState(false);
  const [lightboxSrc, setLightboxSrc] = useState<string | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [recastMenuOpen, setRecastMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const recastMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!menuOpen) return;
    function handler(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false);
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [menuOpen]);

  useEffect(() => {
    if (!recastMenuOpen) return;
    function handler(e: MouseEvent) {
      if (recastMenuRef.current && !recastMenuRef.current.contains(e.target as Node)) {
        setRecastMenuOpen(false);
      }
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [recastMenuOpen]);

  function openProfile() {
    const seed = profileSeedFromUnknown(author);
    if (seed) openProfilePreview(seed);
  }

  function handleCastChannelClick(channelId: string) {
    if (!columnHasChannel(columns, channelId)) {
      addColumn(channelColumnFromSlug(channelId));
    }
  }

  function openMentionProfile(username: string) {
    const list = (cast.mentioned_profiles ?? []) as Record<string, unknown>[];
    const match = list.find(
      (p) => typeof p.username === "string" && p.username.toLowerCase() === username.toLowerCase()
    );
    const seed = profileSeedFromUnknown(match ?? { username });
    if (seed) openProfilePreview(seed);
  }

  function openCast() {
    const hash = cast.hash as string;
    if (hash) window.open(`https://farcaster.xyz/~/conversations/${withHexPrefix(hash)}`, "_blank", "noopener,noreferrer");
  }

  const author = cast.author;
  const reactions = cast.reactions ?? {};
  const viewerReactions = cast.viewer_context ?? {};

  // Source-of-truth from server (viewer_context annotated by our API routes)
  const serverLiked: boolean = viewerReactions.liked ?? false;
  const serverRecasted: boolean = viewerReactions.recasted ?? false;
  const serverLikeCount: number = reactions.likes_count ?? 0;
  const serverRecastCount: number = reactions.recasts_count ?? 0;
  const replyCount: number = cast.replies?.count ?? 0;

  // Local optimistic state — instant UI feedback
  const [liked, setLiked] = useState(serverLiked);
  const [likeCount, setLikeCount] = useState(serverLikeCount);
  const [recasted, setRecasted] = useState(serverRecasted);
  const [recastCount, setRecastCount] = useState(serverRecastCount);

  // Sync from server after refetch
  useEffect(() => { setLiked(serverLiked); }, [serverLiked]);
  useEffect(() => { setLikeCount(serverLikeCount); }, [serverLikeCount]);
  useEffect(() => { setRecasted(serverRecasted); }, [serverRecasted]);
  useEffect(() => { setRecastCount(serverRecastCount); }, [serverRecastCount]);

  const likeMutation = useMutation({
    mutationFn: async (currentlyLiked: boolean) => {
      const res = await fetch("/api/reaction", {
        method: currentlyLiked ? "DELETE" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: "like", castHash: cast.hash, castAuthorFid: author.fid }),
      });
      if (!res.ok) throw new Error("Reaction failed");
    },
    onError: () => {
      // Revert on failure
      setLiked(serverLiked);
      setLikeCount(serverLikeCount);
      queryClient.invalidateQueries({ queryKey: ["feed"] });
    },
  });

  const recastMutation = useMutation({
    mutationFn: async (currentlyRecasted: boolean) => {
      const res = await fetch("/api/reaction", {
        method: currentlyRecasted ? "DELETE" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: "recast", castHash: cast.hash, castAuthorFid: author.fid }),
      });
      if (!res.ok) throw new Error("Reaction failed");
    },
    onError: () => {
      setRecasted(serverRecasted);
      setRecastCount(serverRecastCount);
      queryClient.invalidateQueries({ queryKey: ["feed"] });
    },
  });

  function handleLike() {
    if (likeMutation.isPending) return;
    const next = !liked;
    setLiked(next);
    setLikeCount((c) => (next ? c + 1 : Math.max(0, c - 1)));
    likeMutation.mutate(liked);
  }

  function confirmRecastToggle() {
    if (recastMutation.isPending) return;
    const next = !recasted;
    setRecasted(next);
    setRecastCount((c) => (next ? c + 1 : Math.max(0, c - 1)));
    recastMutation.mutate(recasted);
  }

  // Build a normalized set of URLs from cast.frames[] (Neynar's definitive frame list)
  const castFrames: CastFrame[] = cast.frames ?? [];
  const castFrameUrls = new Set<string>(
    castFrames
      .map((f: CastFrame) => f.frames_url ? normalizeUrl(f.frames_url) : "")
      .filter(Boolean)
  );

  const embeds: Embed[] = cast.embeds ?? [];
  // Quote casts: embeds that have a cast_id or cast object (not a URL embed)
  const quotedRefs = (() => {
    const seen = new Set<string>();
    const refs: { hash: string; seed: Record<string, unknown> | null }[] = [];
    for (const e of embeds) {
      if (e.url) continue;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const embed = e as any;
      const inner = embed.cast ?? embed.cast_id;
      const hash = inner?.hash ?? (typeof embed.cast_id === "string" ? embed.cast_id : null);
      if (!hash || seen.has(hash)) continue;
      seen.add(hash);
      const seed =
        inner && typeof inner === "object" && inner.author ? inner : null;
      refs.push({ hash: String(hash), seed });
    }
    return refs;
  })();
  const imageEmbeds = embeds.filter(isImageEmbed).map((e) => e.url!);
  const videoEmbeds = embeds.filter((e) => !isImageEmbed(e) && isVideoEmbed(e)).map((e) => e.url!);
  const frameEmbeds = embeds.filter((e) => !isImageEmbed(e) && !isVideoEmbed(e) && isFrameEmbed(e, castFrameUrls));
  const spaceEmbeds = embeds.filter(
    (e) => !!e.url && isSpaceEmbedUrl(e.url) && !isImageEmbed(e) && !isVideoEmbed(e)
  );
  const tokenParent = parseTokenParentUrl(cast);
  const tokenUrls = collectTokenEmbedUrls(embeds, cast.text as string | undefined);
  const snapUrls = (() => {
    const seen = new Set<string>();
    const out: string[] = [];
    const add = (raw: string) => {
      if (!isSnapEmbedUrl(raw)) return;
      const u = normalizeSnapUrl(raw);
      if (seen.has(u)) return;
      seen.add(u);
      out.push(u);
    };
    for (const e of embeds) {
      if (e.url) add(e.url);
    }
    const text = cast.text as string | undefined;
    if (text) {
      for (const m of text.matchAll(
        /https?:\/\/(?:snap-host\.farcaster\.xyz\/[0-9a-f-]{36}|[a-z0-9-]+\.host\.neynar\.app)\/?[^\s]*/gi
      )) {
        add(m[0]);
      }
    }
    return out;
  })();
  // Show link cards for ALL non-image, non-video, non-frame, non-space, non-token, non-snap URL embeds.
  const urlEmbeds = embeds.filter(
    (e) =>
      !isImageEmbed(e) &&
      !isVideoEmbed(e) &&
      !isFrameEmbed(e, castFrameUrls) &&
      !!e.url &&
      !isSpaceEmbedUrl(e.url) &&
      !isTokenEmbedUrl(e.url) &&
      !isEip155EmbedUri(e.url) &&
      !isSnapEmbedUrl(e.url) &&
      (e.url.startsWith("http://") || e.url.startsWith("https://"))
  );

  return (
    <>
      <article
        className={
          embedded
            ? "px-3 py-3 rounded-xl border border-[var(--border)] bg-[var(--background)] hover:bg-[var(--surface-hover)] transition-colors cursor-default group"
            : "px-3 py-3 border-b border-[var(--border)] hover:bg-[var(--surface)] transition-colors cursor-default group"
        }
        onClick={() => openConversation(cast.hash as string)}
      >
        <div className="flex items-start gap-2.5">
          {/* Avatar */}
          <button
            onClick={(e) => { e.stopPropagation(); openProfile(); }}
            className="p-0 shrink-0 rounded-full hover:opacity-80 transition-opacity focus:outline-none mt-0.5"
          >
            <UserAvatar
              src={author?.pfp_url}
              alt={author?.display_name ?? author?.username ?? ""}
              size="lg"
            />
          </button>

          <div className="flex-1 min-w-0">
            {/* Author line */}
            <div className="flex items-center gap-1.5 flex-wrap">
              <button
                onClick={(e) => { e.stopPropagation(); openProfile(); }}
                className="text-sm font-semibold text-[var(--foreground)] hover:underline focus:outline-none leading-tight"
              >
                {author?.display_name ?? author?.username}
              </button>
              <button
                onClick={(e) => { e.stopPropagation(); openProfile(); }}
                className="text-xs text-[var(--muted)] hover:underline focus:outline-none leading-tight"
              >
                @{author?.username}
              </button>
              {castChannelSlug && (
                <>
                  <span className="text-xs text-[var(--muted)]">·</span>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleCastChannelClick(castChannelSlug);
                    }}
                    className="text-xs font-medium text-[var(--accent)] hover:underline focus:outline-none leading-tight"
                    title={`Channel ${formatChannelLabel(castChannelSlug)}`}
                  >
                    {formatChannelLabel(castChannelSlug)}
                  </button>
                </>
              )}
              <span className="text-xs text-[var(--muted)] ml-auto shrink-0">
                {formatTime(cast.timestamp)}
              </span>
            </div>

            {/* Cast text — suppress inline URL links that have an embed card below */}
            {cast.text && (
              <p className="text-sm text-[var(--foreground)] mt-1 leading-relaxed whitespace-pre-wrap break-words opacity-90">
                {renderCastText(
                  cast.text,
                  cast.mentioned_profiles ?? [],
                  cast.mentioned_channels ?? [],
                  new Set([
                    ...urlEmbeds.map((e) => e.url),
                    ...spaceEmbeds.map((e) => e.url),
                    ...tokenUrls,
                  ].filter(Boolean) as string[]),
                  tokenUrls,
                  openMentionProfile
                )}
              </p>
            )}

            {/* Quoted casts */}
            {quotedRefs.map(({ hash, seed }) => (
              <QuotedCast key={hash} hash={hash} seed={seed} />
            ))}

            {/* Image embeds */}
            {imageEmbeds.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-1.5">
                {imageEmbeds.map((src) => (
                  <button
                    key={src}
                    onClick={(e) => { e.stopPropagation(); setLightboxSrc(src); }}
                    className="rounded-lg overflow-hidden focus:outline-none"
                  >
                    <Image
                      src={src}
                      alt="Cast image"
                      width={240}
                      height={160}
                      className="object-cover max-h-48 w-auto rounded-lg block"
                      unoptimized
                    />
                  </button>
                ))}
              </div>
            )}

            {/* Video embeds */}
            {videoEmbeds.map((src) => (
              <VideoPlayer key={src} url={src} />
            ))}

            {/* Frame / Mini App embed previews */}
            {frameEmbeds.map((embed) => {
              const matchedFrame = castFrames.find(
                (f: CastFrame) => f.frames_url === embed.url
              );
              return (
                <MiniAppFrameCard
                  key={embed.url}
                  embed={embed}
                  castHash={cast.hash as string}
                  matchedFrame={matchedFrame}
                  tokenParent={tokenParent}
                />
              );
            })}

            {/* Farcaster Snap interactive UI previews */}
            {snapUrls.map((url) => (
              <SnapCard key={url} url={url} castHash={cast.hash as string} />
            ))}

            {/* Farcaster audio Spaces */}
            {spaceEmbeds.map((embed) => (
              <SpaceCard
                key={embed.url}
                url={embed.url!}
                mentionedProfiles={cast.mentioned_profiles ?? []}
                castAuthorFid={author?.fid}
              />
            ))}

            {/* Farcaster coin / ticker (from embeds or cast text) */}
            {tokenUrls.map((url) => (
              <TokenCard key={url} url={url} />
            ))}

            {/* OG URL embeds (clanker / ~/c/ links → ticker card) */}
            {urlEmbeds.map((embed) =>
              isTokenEmbedUrl(embed.url!) ? (
                <TokenCard key={embed.url} url={embed.url!} />
              ) : (
                <OGCard
                  key={embed.url}
                  embed={embed}
                  castHash={cast.hash as string}
                  tokenParent={tokenParent}
                />
              )
            )}

            {/* Action bar — stop propagation so clicks don't open the conversation panel */}
            {/* eslint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-static-element-interactions */}
            <div className="flex items-center gap-4 mt-2.5 -ml-1 relative" onClick={(e) => e.stopPropagation()}>
              {/* Reply */}
              <button
                onClick={(e) => { e.stopPropagation(); setReplyOpen(true); }}
                className="flex items-center gap-1 text-[var(--muted)] hover:text-[var(--accent)] transition-colors"
              >
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                </svg>
                {replyCount > 0 && <span className="text-xs">{formatCount(replyCount)}</span>}
              </button>

              {/* Recast — menu: recast / remove recast or quote cast */}
              <div ref={recastMenuRef} className="relative">
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setRecastMenuOpen((o) => !o);
                  }}
                  className={`flex items-center gap-1 transition-colors ${recasted ? "text-[var(--recast)]" : "text-[var(--muted)] hover:text-[var(--recast)]"}`}
                >
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                  </svg>
                  {recastCount > 0 && <span className="text-xs">{formatCount(recastCount)}</span>}
                </button>
                {recastMenuOpen && (
                  <div className="absolute left-0 bottom-full mb-1 w-40 bg-[var(--surface)] border border-[var(--border)] rounded-xl shadow-xl z-50 py-1">
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setRecastMenuOpen(false);
                        confirmRecastToggle();
                      }}
                      className="w-full text-left px-3 py-2 text-sm text-[var(--foreground)] hover:bg-[var(--surface-hover)] transition-colors flex items-center gap-2"
                    >
                      <svg className="w-3.5 h-3.5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                      </svg>
                      {recasted ? "Remove recast" : "Recast"}
                    </button>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setRecastMenuOpen(false);
                        setQuoteComposeOpen(true);
                      }}
                      className="w-full text-left px-3 py-2 text-sm text-[var(--foreground)] hover:bg-[var(--surface-hover)] rounded-b-xl transition-colors flex items-center gap-2"
                    >
                      <svg className="w-3.5 h-3.5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" />
                      </svg>
                      Quote cast
                    </button>
                  </div>
                )}
              </div>

              {/* Like */}
              <button
                onClick={handleLike}
                className={`flex items-center gap-1 transition-colors ${liked ? "text-[var(--like)]" : "text-[var(--muted)] hover:text-[var(--like)]"}`}
              >
                <svg className="w-3.5 h-3.5" fill={liked ? "currentColor" : "none"} stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" />
                </svg>
                {likeCount > 0 && <span className="text-xs">{formatCount(likeCount)}</span>}
              </button>

              {/* 3-dot menu */}
              <div ref={menuRef} className="ml-auto relative">
                <button
                  onClick={() => setMenuOpen((o) => !o)}
                  className="p-0.5 text-[var(--muted)] hover:text-[var(--foreground)] transition-colors rounded opacity-0 group-hover:opacity-100 focus:opacity-100"
                  title="More options"
                >
                  <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 24 24">
                    <circle cx="5" cy="12" r="2" /><circle cx="12" cy="12" r="2" /><circle cx="19" cy="12" r="2" />
                  </svg>
                </button>
                {menuOpen && (
                  <div className="absolute right-0 bottom-full mb-1 w-44 bg-[var(--surface)] border border-[var(--border)] rounded-xl shadow-xl z-50">
                    <button
                      onClick={() => { setMenuOpen(false); openCast(); }}
                      className="w-full text-left px-3 py-2 text-sm text-[var(--foreground)] hover:bg-[var(--surface-hover)] rounded-t-xl transition-colors flex items-center gap-2"
                    >
                      <svg className="w-3.5 h-3.5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                      </svg>
                      Open in Farcaster
                    </button>
                    <button
                      onClick={() => { setMenuOpen(false); openProfile(); }}
                      className="w-full text-left px-3 py-2 text-sm text-[var(--foreground)] hover:bg-[var(--surface-hover)] rounded-b-xl transition-colors flex items-center gap-2"
                    >
                      <svg className="w-3.5 h-3.5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                      </svg>
                      View profile
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </article>

      {replyOpen && <ReplyModal parentCast={cast} onClose={() => setReplyOpen(false)} threadRootHash={threadRootHash} />}
      {quoteComposeOpen && (
        <ComposeModal quoteCast={cast} onClose={() => setQuoteComposeOpen(false)} />
      )}
      {lightboxSrc && <ImageLightbox src={lightboxSrc} onClose={() => setLightboxSrc(null)} />}
    </>
  );
}

// ─── Quoted cast (embedded cast embed) ───────────────────────────────────────
function QuotedCast({
  hash,
  seed,
}: {
  hash: string;
  seed: Record<string, unknown> | null;
}) {
  const { openConversation, openProfilePreview } = useUiStore();
  const seedForQuery = seed && isQuotedCastSeed(seed) ? seed : null;
  const { data: cast, isPending, isFetching } = useQuotedCast(hash, seedForQuery);
  const loading = (isPending || isFetching) && !cast;

  if (loading) {
    return (
      <div className="mt-2 rounded-xl border border-[var(--border)] bg-[var(--surface)] px-3 py-2.5 animate-pulse">
        <div className="h-2.5 w-24 rounded bg-[var(--surface-hover)] mb-2" />
        <div className="h-2 w-full rounded bg-[var(--surface-hover)]" />
      </div>
    );
  }

  if (!cast) return null;

  const quotedCast = cast;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const author = quotedCast.author as any;
  const text = quotedCast.text as string | undefined;

  function openAuthorProfile(e: React.MouseEvent) {
    e.stopPropagation();
    const profile = profileSeedFromUnknown(author);
    if (profile) openProfilePreview(profile);
  }

  function openMentionProfile(username: string) {
    const list = (quotedCast.mentioned_profiles ?? []) as Record<string, unknown>[];
    const match = list.find(
      (p) => typeof p.username === "string" && p.username.toLowerCase() === username.toLowerCase()
    );
    const profile = profileSeedFromUnknown(match ?? { username });
    if (profile) openProfilePreview(profile);
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const embeds: any[] = (quotedCast.embeds as any[]) ?? [];
  const firstVideo = embeds.find((e) => e.url && isVideoEmbed(e as Embed))?.url as string | undefined;
  const firstImage = !firstVideo
    ? embeds.find((e) => e.url && isImageEmbed(e as Embed))?.url as string | undefined
    : undefined;

  return (
    // Use div + onClick instead of <a> to avoid nesting <a> inside the parent cast's <a>-less
    // article. Mention links inside the text are <a> tags, so the outer wrapper must not be <a>.
    <div
      role="link"
      tabIndex={0}
      onClick={(e) => { e.stopPropagation(); openConversation(hash); }}
      onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.stopPropagation(); openConversation(hash); } }}
      className="mt-2 flex flex-col rounded-xl border border-[var(--border)] bg-[var(--surface)] hover:bg-[var(--surface-hover)] transition-colors overflow-hidden cursor-pointer"
    >
      {/* Accent top line */}
      <div className="h-px bg-[var(--accent)]/30 w-full" />
      <div className="px-3 py-2.5">
        {/* Author row */}
        <div className="flex items-center gap-1.5 mb-1.5 min-w-0">
          <button
            type="button"
            onClick={openAuthorProfile}
            className="shrink-0 rounded-full hover:opacity-80 focus:outline-none"
          >
            <UserAvatar src={author?.pfp_url} alt={author?.username ?? ""} size="xs" />
          </button>
          <button
            type="button"
            onClick={openAuthorProfile}
            className="text-xs font-semibold text-[var(--foreground)] truncate hover:underline focus:outline-none"
          >
            {author?.display_name ?? author?.username ?? "Unknown"}
          </button>
          {author?.username && (
            <button
              type="button"
              onClick={openAuthorProfile}
              className="text-xs text-[var(--muted)] truncate hover:underline focus:outline-none"
            >
              @{author.username}
            </button>
          )}
        </div>
        {/* Cast text */}
        {text ? (
          <p className="text-xs text-[var(--foreground)] opacity-75 whitespace-pre-wrap break-words leading-relaxed">
            {renderCastText(
              text,
              (quotedCast as { mentioned_profiles?: unknown[] }).mentioned_profiles ?? [],
              (quotedCast as { mentioned_channels?: unknown[] }).mentioned_channels ?? [],
              undefined,
              undefined,
              openMentionProfile
            )}
          </p>
        ) : (
          <p className="text-xs text-[var(--muted)] italic">View on Farcaster ↗</p>
        )}
        {/* Video embed — rendered inside the padded area so it sits flush */}
        {firstVideo && <VideoPlayer url={firstVideo} />}
      </div>
      {/* Image from quoted cast (only shown when no video) */}
      {firstImage && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={firstImage}
          alt="Quoted cast image"
          className="w-full max-h-48 object-cover"
        />
      )}
    </div>
  );
}

// ─── OG card — React Query + bulk prefetch; seeds from Hypersnap metadata ────
function OGCard({
  embed,
  castHash,
  tokenParent,
}: {
  embed: Embed;
  castHash: string;
  tokenParent?: ReturnType<typeof parseTokenParentUrl>;
}) {
  const url = embed.url!;
  const castUrl = castConversationUrl(castHash);
  const [imgFailed, setImgFailed] = useState(false);
  const [tweetImgFailed, setTweetImgFailed] = useState(false);
  const seed = ogSeedFromEmbed(embed);
  const { data: og } = useOgMetadata(url, seed);

  let hostname = "";
  try { hostname = new URL(url).hostname.replace(/^www\./, ""); } catch { hostname = url; }

  const isXTwitter = hostname === "x.com" || hostname === "twitter.com";

  const title = og?.title || embed.metadata?.html?.ogTitle || "";
  const desc = og?.description || embed.metadata?.html?.ogDescription || "";
  const image = og?.image || embed.metadata?.html?.ogImage?.[0]?.url;
  const showImg = image && !imgFailed && !isXTwitter;
  const isMiniApp = isMiniAppUrl(url) || !!embed.metadata?.miniapp;
  const isFrame = !!(og?.isFrame || seed?.isFrame || isMiniApp);

  // ── Direct image URL (dynamic APIs like /api/images/… with no extension) ─
  if ((og?.isDirectImage || isImageEmbedUrl(url, embed.metadata?.content_type)) && image && !imgFailed) {
    return (
      <a
        href={url}
        target="_blank"
        rel="noopener noreferrer"
        className="mt-2 block rounded-xl overflow-hidden border border-[var(--border)] hover:border-[var(--muted)] transition-colors"
        onClick={(e) => e.stopPropagation()}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={image}
          alt=""
          onError={() => setImgFailed(true)}
          className="w-full max-h-96 object-contain bg-white block"
        />
      </a>
    );
  }

  // ── Frame / Mini App card (fallback when not classified as frameEmbeds) ────
  if (isFrame) {
    return (
      <MiniAppFrameCard
        embed={embed}
        castHash={castHash}
        tokenParent={tokenParent}
      />
    );
  }

  // ── X / Twitter card ─────────────────────────────────────────────────────
  if (isXTwitter) {
    const tweetText = og?.tweetText;
    const tweetAuthor = og?.tweetAuthor;
    const tweetHandle = og?.tweetHandle;
    const tweetImage = og?.image;
    const loading = !og?.tweetText && !seed?.tweetText && isXTwitter;

    return (
      <a
        href={url}
        target="_blank"
        rel="noopener noreferrer"
        onClick={(e) => e.stopPropagation()}
        className="mt-2 flex flex-col rounded-xl border border-[var(--border)] bg-[var(--surface)] hover:bg-[var(--surface-hover)] transition-colors overflow-hidden"
      >
        <div className="px-3 py-2.5">
          <div className="flex items-center gap-1.5 mb-1.5">
            <XIcon className="w-3 h-3 text-[var(--foreground)] shrink-0" />
            {tweetAuthor && (
              <span className="text-xs font-semibold text-[var(--foreground)] truncate">{tweetAuthor}</span>
            )}
            {tweetHandle && (
              <span className="text-xs text-[var(--muted)] truncate">{tweetHandle}</span>
            )}
            <span className="text-xs text-[var(--muted)] ml-auto shrink-0">x.com</span>
          </div>
          {loading && !tweetText ? (
            <div className="space-y-1.5 animate-pulse">
              <div className="h-2 rounded bg-[var(--surface-hover)] w-3/4" />
              <div className="h-2 rounded bg-[var(--surface-hover)] w-full" />
              <div className="h-2 rounded bg-[var(--surface-hover)] w-2/3" />
            </div>
          ) : tweetText ? (
            <p className="text-xs text-[var(--foreground)] opacity-80 whitespace-pre-wrap break-words leading-relaxed">
              {tweetText}
            </p>
          ) : (
            <p className="text-xs text-[var(--muted)] italic">View on X ↗</p>
          )}
        </div>
        {tweetImage && !tweetImgFailed && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={tweetImage}
            alt="Tweet image"
            className="w-full object-cover border-t border-[var(--border)]"
            onError={() => setTweetImgFailed(true)}
          />
        )}
      </a>
    );
  }

  // ── Generic link card ─────────────────────────────────────────────────────
  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      className="mt-2 flex rounded-xl border border-[var(--border)] overflow-hidden hover:border-[var(--muted)] hover:bg-[var(--surface)] transition-colors"
      onClick={(e) => e.stopPropagation()}
    >
      {showImg ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={image}
          alt=""
          onError={() => setImgFailed(true)}
          className="object-cover shrink-0 w-20 h-20"
        />
      ) : (
        <div className="w-12 shrink-0 flex items-center justify-center bg-[var(--surface-hover)]">
          <svg className="w-4 h-4 text-[var(--muted)]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
          </svg>
        </div>
      )}
      <div className="px-2.5 py-2 min-w-0 flex flex-col justify-center gap-0.5">
        {title ? (
          <p className="text-xs font-medium text-[var(--foreground)] line-clamp-2">{title}</p>
        ) : !og?.title && !seed?.title ? (
          <div className="h-2 rounded bg-[var(--surface-hover)] w-3/4 animate-pulse" />
        ) : null}
        {desc && (
          <p className="text-xs text-[var(--muted)] line-clamp-2">{desc}</p>
        )}
        <p className="text-[10px] text-[var(--muted)] truncate">{og?.siteName || hostname}</p>
      </div>
    </a>
  );
}

function XIcon({ className = "w-4 h-4 text-[var(--foreground)]" }: { className?: string }) {
  return (
    <svg className={className} fill="currentColor" viewBox="0 0 24 24">
      <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-4.714-6.231-5.401 6.231H2.744l7.734-8.858L1.25 2.25H8.08l4.253 5.622zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
    </svg>
  );
}

function formatTime(timestamp: string): string {
  if (!timestamp) return "";
  const date = new Date(timestamp);
  const now = new Date();
  const diffMins = Math.floor((now.getTime() - date.getTime()) / 60_000);
  if (diffMins < 1) return "just now";
  if (diffMins < 60) return `${diffMins}m`;
  const diffHours = Math.floor(diffMins / 60);
  if (diffHours < 24) return `${diffHours}h`;
  return `${Math.floor(diffHours / 24)}d`;
}

function formatCount(n: number): string {
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`;
  return String(n);
}
