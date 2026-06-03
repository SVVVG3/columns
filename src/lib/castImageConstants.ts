/** Shared limits for cast photo attachments (safe to import from client components). */

export const MAX_CAST_IMAGES = 4;

/** Max bytes the server accepts per uploaded image (after client compression). */
export const MAX_CAST_IMAGE_BYTES = 3 * 1024 * 1024;

/** Client-side compression targets before upload. */
export const CLIENT_COMPRESS_MAX_DIMENSION = 2048;
export const CLIENT_COMPRESS_MAX_MB = 2;

/** Skip re-encoding animated GIFs; max size when uploading GIF as-is. */
export const MAX_GIF_BYTES = MAX_CAST_IMAGE_BYTES;

const ALLOWED_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/gif",
  "image/webp",
]);

export function isAllowedCastImageType(type: string): boolean {
  return ALLOWED_TYPES.has(type);
}

export function extensionForImageType(type: string): string {
  const map: Record<string, string> = {
    "image/jpeg": ".jpg",
    "image/png": ".png",
    "image/gif": ".gif",
    "image/webp": ".webp",
  };
  return map[type] ?? ".jpg";
}

export function isHeicImage(file: File): boolean {
  const t = file.type.toLowerCase();
  if (t === "image/heic" || t === "image/heif") return true;
  return /\.heic$/i.test(file.name) || /\.heif$/i.test(file.name);
}

/** True when the file should be treated as GIF (skip lossy re-encode). */
export function isGifFileName(file: File): boolean {
  if (file.type === "image/gif") return true;
  return /\.gif$/i.test(file.name);
}

/** Read GIF89a / GIF87a magic bytes. */
export function bufferIsGif(buffer: ArrayBuffer | Buffer): boolean {
  const b = buffer instanceof Buffer ? buffer : new Uint8Array(buffer);
  if (b.length < 6) return false;
  return b[0] === 0x47 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x38;
}
