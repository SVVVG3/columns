import "server-only";

import { mkdir, writeFile } from "fs/promises";
import path from "path";
import { randomUUID } from "crypto";
import { PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import {
  extensionForImageType,
  MAX_CAST_IMAGE_BYTES,
} from "@/lib/castImageConstants";
import { validateCastImageBuffer } from "@/lib/castImageValidate";

export { MAX_CAST_IMAGES, MAX_CAST_IMAGE_BYTES } from "@/lib/castImageConstants";

interface R2Config {
  client: S3Client;
  bucket: string;
  publicBase: string;
}

function getR2Config(): R2Config | null {
  const accountId = process.env.R2_ACCOUNT_ID;
  const accessKeyId = process.env.R2_ACCESS_KEY_ID;
  const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY;
  const bucket = process.env.R2_BUCKET_NAME;
  const publicBase = process.env.R2_PUBLIC_BASE_URL?.replace(/\/$/, "");

  if (!accountId || !accessKeyId || !secretAccessKey || !bucket || !publicBase) {
    return null;
  }

  const client = new S3Client({
    region: "auto",
    endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
    credentials: { accessKeyId, secretAccessKey },
  });

  return { client, bucket, publicBase };
}

function isR2Configured(): boolean {
  return getR2Config() !== null;
}

async function uploadToR2(
  buffer: Buffer,
  contentType: string
): Promise<string> {
  const r2 = getR2Config();
  if (!r2) {
    throw new Error(
      "R2 is not configured. Set R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET_NAME, and R2_PUBLIC_BASE_URL in .env.local."
    );
  }

  const ext = extensionForImageType(contentType);
  const key = `casts/${randomUUID()}${ext}`;

  await r2.client.send(
    new PutObjectCommand({
      Bucket: r2.bucket,
      Key: key,
      Body: buffer,
      ContentType: contentType,
      CacheControl: "public, max-age=31536000, immutable",
    })
  );

  return `${r2.publicBase}/${key}`;
}

async function uploadToLocalPublic(
  buffer: Buffer,
  contentType: string,
  appOrigin: string
): Promise<string> {
  const ext = extensionForImageType(contentType);
  const dir = path.join(process.cwd(), "public", "cast-uploads");
  await mkdir(dir, { recursive: true });
  const name = `${randomUUID()}${ext}`;
  await writeFile(path.join(dir, name), buffer);
  return `${appOrigin.replace(/\/$/, "")}/cast-uploads/${name}`;
}

/**
 * Upload image bytes and return a public HTTPS URL suitable for cast embeds.
 * Uses Cloudflare R2 when configured; otherwise local /public in development.
 */
export async function uploadCastImage(
  buffer: Buffer,
  declaredContentType: string,
  appOrigin: string
): Promise<string> {
  const validation = validateCastImageBuffer(buffer, declaredContentType);
  if (!validation.ok) {
    throw new Error(validation.error);
  }

  const contentType = validation.contentType;

  if (buffer.length > MAX_CAST_IMAGE_BYTES) {
    throw new Error("Image exceeds 3 MB limit");
  }

  if (isR2Configured()) {
    return uploadToR2(buffer, contentType);
  }

  if (process.env.NODE_ENV === "development") {
    return uploadToLocalPublic(buffer, contentType, appOrigin);
  }

  throw new Error(
    "Image hosting not configured. Set R2_* variables in .env.local (see .env.local.example)."
  );
}
