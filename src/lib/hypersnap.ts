/**
 * Hypersnap read API helper.
 *
 * All Hypersnap read endpoints are unauthenticated — no API key required.
 * Set HYPERSNAP_URL in env to point at a self-hosted node; defaults to the
 * public Quilibrium node.
 */

import { NextResponse } from "next/server";

const BASE_URL =
  (process.env.HYPERSNAP_URL ?? "https://haatz.quilibrium.com").replace(/\/$/, "");

const MAX_429_RETRIES = 3;
const FEED_MAX_CONCURRENT = 4;

/** Pass on feed-pagination Hypersnap calls to avoid burst 429s from multi-column loads. */
export type HsnapOptions = { throttle?: boolean };

export class HypersnapError extends Error {
  readonly status: number;
  readonly path: string;

  constructor(status: number, path: string, message: string) {
    super(message);
    this.name = "HypersnapError";
    this.status = status;
    this.path = path;
  }
}

export function isHypersnapError(err: unknown): err is HypersnapError {
  return err instanceof HypersnapError;
}

/** HTTP status to return from BFF routes (upstream 5xx → 502). */
export function hypersnapErrorStatus(err: unknown): number {
  if (!isHypersnapError(err)) return 502;
  if (err.status === 404 || err.status === 429) return err.status;
  if (err.status >= 400 && err.status < 500) return err.status;
  return 502;
}

export function hypersnapErrorMessage(err: unknown): string {
  if (isHypersnapError(err)) return err.message;
  if (err instanceof Error) return err.message;
  return String(err);
}

/** Map Hypersnap failures to JSON API responses with correct status codes. */
export function apiErrorFromHypersnap(err: unknown, logTag?: string): NextResponse {
  const status = hypersnapErrorStatus(err);
  const message = hypersnapErrorMessage(err);
  if (status >= 500 && logTag) {
    console.error(logTag, message, err);
  }
  return NextResponse.json({ error: message }, { status });
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function retryDelayMs(attempt: number, retryAfterHeader: string | null): number {
  if (retryAfterHeader) {
    const sec = parseInt(retryAfterHeader, 10);
    if (!Number.isNaN(sec) && sec > 0) return sec * 1000;
  }
  return Math.min(1000 * 2 ** attempt, 8_000);
}

let feedInFlight = 0;
const feedWaiters: Array<() => void> = [];

async function acquireFeedSlot(): Promise<void> {
  if (feedInFlight < FEED_MAX_CONCURRENT) {
    feedInFlight++;
    return;
  }
  await new Promise<void>((resolve) => {
    feedWaiters.push(() => {
      feedInFlight++;
      resolve();
    });
  });
}

function releaseFeedSlot(): void {
  feedInFlight = Math.max(0, feedInFlight - 1);
  const next = feedWaiters.shift();
  if (next) next();
}

async function parseErrorBody(res: Response): Promise<string> {
  try {
    const body = await res.json();
    if (body && typeof body === "object" && "message" in body) {
      return String((body as { message: unknown }).message);
    }
    return JSON.stringify(body);
  } catch {
    return (await res.text().catch(() => "")) || res.statusText;
  }
}

async function hsnapFetchOnce<T>(
  path: string,
  init: RequestInit,
  params?: Record<string, string | number | undefined>
): Promise<T> {
  const url = new URL(`${BASE_URL}${path}`);

  if (params) {
    for (const [key, value] of Object.entries(params)) {
      if (value !== undefined && value !== null && value !== "") {
        url.searchParams.set(key, String(value));
      }
    }
  }

  let lastError: HypersnapError | null = null;

  for (let attempt = 0; attempt <= MAX_429_RETRIES; attempt++) {
    const res = await fetch(url.toString(), {
      next: { revalidate: 30 },
      ...init,
      headers: {
        Accept: "application/json",
        ...(init.headers as Record<string, string> | undefined),
      },
    });

    if (res.status === 429 && attempt < MAX_429_RETRIES) {
      await sleep(retryDelayMs(attempt, res.headers.get("Retry-After")));
      continue;
    }

    if (!res.ok) {
      const detail = await parseErrorBody(res);
      lastError = new HypersnapError(
        res.status,
        path,
        detail || res.statusText || `HTTP ${res.status}`
      );
      break;
    }

    return res.json() as Promise<T>;
  }

  throw lastError ?? new HypersnapError(502, path, "Hypersnap request failed");
}

async function hsnapOnce<T>(path: string, params?: Record<string, string | number | undefined>): Promise<T> {
  return hsnapFetchOnce<T>(path, { headers: { Accept: "application/json" } }, params);
}

async function runWithThrottle<T>(options: HsnapOptions | undefined, fn: () => Promise<T>): Promise<T> {
  if (options?.throttle) await acquireFeedSlot();
  try {
    return await fn();
  } finally {
    if (options?.throttle) releaseFeedSlot();
  }
}

/**
 * Typed GET against the Hypersnap HTTP API.
 * Throws {@link HypersnapError} on non-2xx (after 429 retries with backoff).
 */
export async function hsnap<T>(
  path: string,
  params?: Record<string, string | number | undefined>,
  options?: HsnapOptions
): Promise<T> {
  return runWithThrottle(options, () => hsnapOnce<T>(path, params));
}

/** Typed POST against the Hypersnap HTTP API (e.g. batch cast-interactions). */
export async function hsnapPost<T>(
  path: string,
  body: unknown,
  options?: HsnapOptions
): Promise<T> {
  return runWithThrottle(options, () =>
    hsnapFetchOnce<T>(path, {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    })
  );
}

/** Options for feed/search pagination — limits concurrent Hypersnap calls per request. */
export const HSNAP_FEED: HsnapOptions = { throttle: true };
