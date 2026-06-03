"use client";

import imageCompression from "browser-image-compression";
import {
  CLIENT_COMPRESS_MAX_DIMENSION,
  CLIENT_COMPRESS_MAX_MB,
  bufferIsGif,
  isGifFileName,
  isHeicImage,
  MAX_GIF_BYTES,
} from "@/lib/castImageConstants";

async function fileIsGif(file: File): Promise<boolean> {
  if (isGifFileName(file)) return true;
  if (file.size < 6) return false;
  const header = await file.slice(0, 6).arrayBuffer();
  return bufferIsGif(header);
}

/**
 * Resize and re-encode photos before upload (WebP/JPEG). GIFs are uploaded as-is
 * to preserve animation; HEIC is rejected.
 */
export async function compressCastImageForUpload(file: File): Promise<File> {
  if (isHeicImage(file)) {
    throw new Error("HEIC photos are not supported. Export as JPEG or PNG first.");
  }

  if (await fileIsGif(file)) {
    if (file.size > MAX_GIF_BYTES) {
      throw new Error("GIF must be under 3 MB. Try a shorter clip or fewer frames.");
    }
    if (file.type === "image/gif") return file;
    return new File([file], file.name.match(/\.gif$/i) ? file.name : `${file.name || "upload"}.gif`, {
      type: "image/gif",
      lastModified: file.lastModified,
    });
  }

  if (!file.type.startsWith("image/")) {
    throw new Error("Only image files are supported.");
  }

  const compressed = await imageCompression(file, {
    maxSizeMB: CLIENT_COMPRESS_MAX_MB,
    maxWidthOrHeight: CLIENT_COMPRESS_MAX_DIMENSION,
    useWebWorker: true,
    preserveExif: false,
    fileType:
      file.type === "image/png" || file.type === "image/webp"
        ? "image/webp"
        : "image/jpeg",
  });

  return compressed;
}
