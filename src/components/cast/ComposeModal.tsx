"use client";

import { useState, useRef, useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { MAX_CAST_IMAGES, isHeicImage } from "@/lib/castImageConstants";
import { buildCastPublishEmbeds } from "@/lib/composeEmbeds";
import { compressCastImageForUpload } from "@/lib/compressCastImage";
import { fetchWithTimeout } from "@/lib/fetchWithTimeout";

interface ComposeModalProps {
  onClose: () => void;
  parentHash?: string;
  parentCast?: Record<string, unknown>;
  /** Cast to embed as a quote (no parent — publishes a new cast with cast_id embed). */
  quoteCast?: Record<string, unknown>;
  /** Root cast hash of the conversation being replied in — used to bust the server + client cache. */
  threadRootHash?: string;
}

function withHexPrefix(hash: string): string {
  return hash.startsWith("0x") ? hash : `0x${hash}`;
}

interface PendingImage {
  id: string;
  file: File;
  previewUrl: string;
}

export function ComposeModal({ onClose, parentHash, parentCast, quoteCast, threadRootHash }: ComposeModalProps) {
  const [text, setText] = useState("");
  const [images, setImages] = useState<PendingImage[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitStatus, setSubmitStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const queryClient = useQueryClient();

  useEffect(() => {
    textareaRef.current?.focus();
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose]);

  useEffect(() => {
    return () => {
      for (const img of images) URL.revokeObjectURL(img.previewUrl);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- revoke on unmount only
  }, []);

  function resizeTextarea() {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  }

  useEffect(() => {
    resizeTextarea();
  }, [text, images.length]);

  function revokeAndRemove(id: string) {
    setImages((prev) => {
      const target = prev.find((i) => i.id === id);
      if (target) URL.revokeObjectURL(target.previewUrl);
      return prev.filter((i) => i.id !== id);
    });
  }

  function handleFilesSelected(files: FileList | null) {
    if (!files?.length) return;
    setError(null);

    const remaining = MAX_CAST_IMAGES - images.length;
    if (remaining <= 0) {
      setError(`You can attach up to ${MAX_CAST_IMAGES} photos.`);
      return;
    }

    const toAdd: PendingImage[] = [];
    for (const file of Array.from(files).slice(0, remaining)) {
      if (isHeicImage(file)) {
        setError("HEIC photos are not supported. Export as JPEG or PNG first.");
        continue;
      }
      if (!file.type.startsWith("image/")) {
        setError("Only image files are supported.");
        continue;
      }
      toAdd.push({
        id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
        file,
        previewUrl: URL.createObjectURL(file),
      });
    }

    if (toAdd.length) setImages((prev) => [...prev, ...toAdd]);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  async function uploadImage(file: File): Promise<string> {
    setSubmitStatus("Casting…");
    const compressed = await compressCastImageForUpload(file);
    const form = new FormData();
    const name =
      compressed.name ||
      (compressed.type === "image/gif" ? "upload.gif" : "upload.jpg");
    form.append("file", compressed, name);
    const res = await fetchWithTimeout("/api/upload/cast-image", {
      method: "POST",
      body: form,
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error ?? "Image upload failed");
    return data.url as string;
  }

  async function handleSubmit() {
    const trimmed = text.trim();
    if ((!trimmed && images.length === 0 && !quoteCast) || isSubmitting) return;
    setIsSubmitting(true);
    setError(null);
    setSubmitStatus("Casting…");

    try {
      const imageUrls: string[] = [];
      for (let i = 0; i < images.length; i++) {
        imageUrls.push(await uploadImage(images[i].file));
      }

      setSubmitStatus("Casting…");
      const quoteEmbed =
        quoteCast?.hash && (quoteCast.author as { fid?: number })?.fid
          ? [
              {
                cast_id: {
                  fid: (quoteCast.author as { fid: number }).fid,
                  hash: withHexPrefix(String(quoteCast.hash)),
                },
              },
            ]
          : [];
      const embeds = buildCastPublishEmbeds(trimmed, [
        ...quoteEmbed,
        ...imageUrls.map((url) => ({ url })),
      ]);
      const res = await fetchWithTimeout("/api/cast", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          text: trimmed,
          parentHash,
          threadRootHash,
          embeds,
        }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error ?? "Failed to post cast");
      }
      queryClient.invalidateQueries({ queryKey: ["feed"] });
      if (threadRootHash) {
        queryClient.invalidateQueries({ queryKey: ["conversation", threadRootHash] });
      }
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setIsSubmitting(false);
      setSubmitStatus(null);
    }
  }

  const charCount = text.length;
  const maxChars = 1024;
  const overLimit = charCount > maxChars;
  const canSubmit =
    (text.trim().length > 0 || images.length > 0 || !!quoteCast) && !overLimit && !isSubmitting;

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center pt-20 bg-black/70 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="w-full max-w-lg max-h-[min(85vh,640px)] flex flex-col overflow-hidden bg-[var(--surface)] border border-[var(--border)] rounded-2xl shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="shrink-0 flex items-center justify-between px-4 pt-4 pb-2">
          <h2 className="text-sm font-semibold text-[var(--foreground)]">
            {parentHash ? "Reply" : quoteCast ? "Quote cast" : "New Cast"}
          </h2>
          <button
            onClick={onClose}
            className="text-[var(--muted)] hover:text-[var(--foreground)] transition-colors"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {(parentCast || quoteCast) && (
          <div className="shrink-0 mx-4 mb-2 px-3 py-2 rounded-lg bg-[var(--surface-hover)] border border-[var(--border)] text-xs text-[var(--muted)]">
            <span className="font-medium text-[var(--foreground)]">
              @{((parentCast ?? quoteCast)!.author as { username: string })?.username}
            </span>{" "}
            {String((parentCast ?? quoteCast)!.text ?? "").slice(0, 100)}
            {String((parentCast ?? quoteCast)!.text ?? "").length > 100 && "…"}
          </div>
        )}

        <div
          className="flex-1 min-h-0 overflow-y-auto overscroll-contain feed-scroll px-4 pb-3"
          onTouchMove={(e) => e.stopPropagation()}
        >
          <textarea
            ref={textareaRef}
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder={
              parentHash ? "Write your reply…" : quoteCast ? "Add your thoughts…" : "What's on your mind?"
            }
            rows={4}
            className="w-full min-h-[120px] bg-transparent text-[var(--foreground)] text-base placeholder:text-[var(--muted)] resize-none outline-none leading-relaxed overflow-hidden"
            onKeyDown={(e) => {
              if ((e.metaKey || e.ctrlKey) && e.key === "Enter" && canSubmit) handleSubmit();
            }}
          />

          {images.length > 0 && (
            <div
              className={`mt-2 gap-2 ${
                images.length === 1 ? "" : "grid grid-cols-2"
              }`}
            >
              {images.map((img) => (
                <div
                  key={img.id}
                  className="relative w-fit max-w-full rounded-lg border border-[var(--border)] overflow-hidden"
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={img.previewUrl}
                    alt=""
                    className="block max-h-64 max-w-full h-auto w-auto"
                  />
                  <button
                    type="button"
                    onClick={() => revokeAndRemove(img.id)}
                    className="absolute top-1 right-1 w-6 h-6 rounded-full bg-black/70 text-white text-xs flex items-center justify-center hover:bg-black/90"
                    aria-label="Remove photo"
                  >
                    ×
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="shrink-0 flex items-center justify-between px-4 py-3 border-t border-[var(--border)]">
          <div className="flex items-center gap-3 min-w-0">
            <input
              ref={fileInputRef}
              type="file"
              accept="image/jpeg,image/png,image/gif,image/webp"
              multiple
              className="hidden"
              onChange={(e) => handleFilesSelected(e.target.files)}
            />
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={images.length >= MAX_CAST_IMAGES || isSubmitting}
              className="text-[var(--muted)] hover:text-[var(--accent)] disabled:opacity-40 transition-colors p-1 rounded"
              title={`Add photos (up to ${MAX_CAST_IMAGES})`}
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={1.5}
                  d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"
                />
              </svg>
            </button>
            {error ? (
              <p className="text-xs text-red-400 truncate">{error}</p>
            ) : (
              <span className={`text-xs ${overLimit ? "text-red-400" : "text-[var(--muted)]"}`}>
                {charCount}/{maxChars}
                {images.length > 0 && ` · ${images.length}/${MAX_CAST_IMAGES} photos`}
              </span>
            )}
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <span className="text-xs text-[var(--muted)]">⌘↵ to send</span>
            <button
              onClick={handleSubmit}
              disabled={!canSubmit}
              className="px-4 py-1.5 rounded-full bg-[var(--accent)] hover:bg-[var(--accent-hover)] disabled:opacity-40 disabled:cursor-not-allowed text-white text-sm font-medium transition-colors"
            >
              {isSubmitting ? submitStatus ?? "Casting…" : "Cast"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
