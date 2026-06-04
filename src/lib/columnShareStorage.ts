import "server-only";

import { mkdir, readFile, writeFile } from "fs/promises";
import path from "path";
import { randomBytes } from "crypto";
import { GetObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";

const SHARE_PREFIX = "column-shares";
const MAX_SHARE_BYTES = 100_000;

interface R2Config {
  client: S3Client;
  bucket: string;
}

function getR2Config(): R2Config | null {
  const accountId = process.env.R2_ACCOUNT_ID;
  const accessKeyId = process.env.R2_ACCESS_KEY_ID;
  const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY;
  const bucket = process.env.R2_BUCKET_NAME;

  if (!accountId || !accessKeyId || !secretAccessKey || !bucket) {
    return null;
  }

  return {
    client: new S3Client({
      region: "auto",
      endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
      credentials: { accessKeyId, secretAccessKey },
    }),
    bucket,
  };
}

/** URL-safe short id for ?c= links */
export function generateColumnShareId(): string {
  return randomBytes(6).toString("base64url");
}

export function isValidColumnShareId(id: string): boolean {
  return /^[A-Za-z0-9_-]{6,16}$/.test(id);
}

export async function storeColumnShareJson(id: string, json: string): Promise<void> {
  if (Buffer.byteLength(json, "utf8") > MAX_SHARE_BYTES) {
    throw new Error("Column share payload too large");
  }

  const r2 = getR2Config();
  const key = `${SHARE_PREFIX}/${id}.json`;

  if (r2) {
    await r2.client.send(
      new PutObjectCommand({
        Bucket: r2.bucket,
        Key: key,
        Body: json,
        ContentType: "application/json",
        CacheControl: "public, max-age=31536000, immutable",
      })
    );
    return;
  }

  const dir = path.join(process.cwd(), "public", SHARE_PREFIX);
  await mkdir(dir, { recursive: true });
  await writeFile(path.join(dir, `${id}.json`), json, "utf8");
}

export async function loadColumnShareJson(id: string): Promise<string | null> {
  if (!isValidColumnShareId(id)) return null;

  const r2 = getR2Config();
  const key = `${SHARE_PREFIX}/${id}.json`;

  if (r2) {
    try {
      const res = await r2.client.send(
        new GetObjectCommand({ Bucket: r2.bucket, Key: key })
      );
      if (!res.Body) return null;
      return await res.Body.transformToString("utf-8");
    } catch {
      return null;
    }
  }

  try {
    const file = path.join(process.cwd(), "public", SHARE_PREFIX, `${id}.json`);
    return await readFile(file, "utf8");
  } catch {
    return null;
  }
}
