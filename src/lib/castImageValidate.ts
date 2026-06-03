import "server-only";

import { isAllowedCastImageType } from "@/lib/castImageConstants";

/** Verify buffer magic bytes match an allowed image type (guards against spoofed MIME). */
export function detectImageContentType(buffer: Buffer): string | null {
  if (buffer.length < 12) return null;

  if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return "image/jpeg";
  }
  if (
    buffer[0] === 0x89 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x4e &&
    buffer[3] === 0x47
  ) {
    return "image/png";
  }
  if (buffer[0] === 0x47 && buffer[1] === 0x49 && buffer[2] === 0x46) {
    return "image/gif";
  }
  if (
    buffer[0] === 0x52 &&
    buffer[1] === 0x49 &&
    buffer[2] === 0x46 &&
    buffer[3] === 0x46 &&
    buffer[8] === 0x57 &&
    buffer[9] === 0x45 &&
    buffer[10] === 0x42 &&
    buffer[11] === 0x50
  ) {
    return "image/webp";
  }

  return null;
}

export function validateCastImageBuffer(
  buffer: Buffer,
  declaredType: string
): { ok: true; contentType: string } | { ok: false; error: string } {
  const detected = detectImageContentType(buffer);
  if (!detected || !isAllowedCastImageType(detected)) {
    return { ok: false, error: "File is not a supported image format" };
  }
  if (declaredType && declaredType !== detected) {
    // Trust detected bytes over client-declared MIME
    return { ok: true, contentType: detected };
  }
  return { ok: true, contentType: detected };
}
