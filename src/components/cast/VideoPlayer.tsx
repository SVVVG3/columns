"use client";

import { useState, useEffect, useRef } from "react";
import Hls from "hls.js";
import type { VideoResolveData } from "@/app/api/video-resolve/route";

function youtubeVideoId(url: string): string | null {
  return url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/)([^&\s?]+)/)?.[1] ?? null;
}

export function VideoPlayer({ url }: { url: string }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const hlsRef = useRef<Hls | null>(null);

  const isHLS = /\.m3u8/i.test(url) || /stream\.farcaster\.xyz/i.test(url);
  const ytId = youtubeVideoId(url);

  const [resolved, setResolved] = useState<VideoResolveData | null>(null);

  // Resolve redirect chain server-side to get the Cloudflare Stream iframe URL
  useEffect(() => {
    if (!isHLS || ytId) return;
    fetch(`/api/video-resolve?url=${encodeURIComponent(url)}`)
      .then((r) => r.ok ? r.json() : null)
      .then((data) => { if (data) setResolved(data); })
      .catch(() => {/* fail silently — will fall back to hls.js */});
  }, [url, isHLS, ytId]);

  // hls.js fallback — only used when not a Cloudflare Stream URL
  useEffect(() => {
    if (!isHLS || ytId) return;
    if (resolved?.iframeUrl) return; // Cloudflare Stream iframe handles playback
    if (!resolved) return; // Wait until resolution attempt completes
    if (!videoRef.current) return;

    const video = videoRef.current;
    const src = resolved.finalUrl || url;

    if (video.canPlayType("application/vnd.apple.mpegurl")) {
      video.src = src;
    } else if (Hls.isSupported()) {
      const hls = new Hls({ enableWorker: false });
      hlsRef.current = hls;
      hls.loadSource(src);
      hls.attachMedia(video);
    }

    return () => {
      hlsRef.current?.destroy();
      hlsRef.current = null;
    };
  }, [url, isHLS, ytId, resolved]);

  // ── YouTube ──────────────────────────────────────────────────────────────────
  if (ytId) {
    return (
      // eslint-disable-next-line jsx-a11y/iframe-has-title
      <iframe
        src={`https://www.youtube.com/embed/${ytId}?rel=0`}
        className="mt-2 w-full rounded-xl bg-black"
        style={{ aspectRatio: "16/9" }}
        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
        allowFullScreen
        onClick={(e) => e.stopPropagation()}
      />
    );
  }

  // ── Cloudflare Stream (Farcaster native video) ────────────────────────────
  if (resolved?.iframeUrl) {
    return (
      // eslint-disable-next-line jsx-a11y/iframe-has-title
      <iframe
        src={resolved.iframeUrl}
        className="mt-2 w-full rounded-xl bg-black"
        style={{ aspectRatio: "16/9" }}
        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
        allowFullScreen
        onClick={(e) => e.stopPropagation()}
      />
    );
  }

  // ── Direct video / hls.js fallback ───────────────────────────────────────
  return (
    // eslint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-static-element-interactions
    <div onClick={(e) => e.stopPropagation()}>
      {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
      <video
        ref={isHLS ? videoRef : undefined}
        src={!isHLS ? url : undefined}
        controls
        playsInline
        className="mt-2 w-full rounded-xl max-h-72 bg-black"
      />
    </div>
  );
}
