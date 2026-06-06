import { MAX_COLUMNS } from "@/lib/columnLimits";
import { migrateChannelColumnTitle } from "@/lib/channelDisplay";
import type { FeedColumnConfig, FeedColumnType } from "@/types";

export const LAYOUT_SCHEMA_VERSION = 3 as const;
export const PENDING_COLUMN_KEY = "fc_pending_column";
/** Short share link ?c= id (resolved via /api/share/column) */
export const PENDING_COLUMN_SHARE_ID_KEY = "fc_pending_column_share_id";
/** @deprecated Legacy full-layout links; still imported by appending columns */
export const PENDING_LAYOUT_KEY = "fc_pending_layout";

const VALID_TYPES = new Set<FeedColumnType>([
  "home",
  "channel",
  "user",
  "keyword",
  "trending",
  "coindesk",
  "rss",
]);

export type ShareableColumn = {
  schemaVersion: typeof LAYOUT_SCHEMA_VERSION;
  column: Omit<FeedColumnConfig, "id">;
};

/** Legacy full-layout export format (still accepted on import). */
export type ShareableLayout = {
  schemaVersion: typeof LAYOUT_SCHEMA_VERSION;
  columns: Omit<FeedColumnConfig, "id">[];
};

type SharePayload = ShareableColumn | ShareableLayout;

function stripId({ id: _id, ...rest }: FeedColumnConfig): Omit<FeedColumnConfig, "id"> {
  return rest;
}

export function exportShareableColumn(column: FeedColumnConfig): ShareableColumn {
  return {
    schemaVersion: LAYOUT_SCHEMA_VERSION,
    column: stripId(column),
  };
}

export function encodeShareParam(payload: SharePayload): string {
  const json = JSON.stringify(payload);
  const bytes = new TextEncoder().encode(json);
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function decodeShareParam(param: string): SharePayload {
  const padded = param.replace(/-/g, "+").replace(/_/g, "/");
  const pad = padded.length % 4 === 0 ? padded : padded + "=".repeat(4 - (padded.length % 4));
  const binary = atob(pad);
  const bytes = Uint8Array.from(binary, (c) => c.charCodeAt(0));
  const json = new TextDecoder().decode(bytes);
  const parsed = JSON.parse(json) as SharePayload;
  validateSharePayload(parsed);
  return parsed;
}

export function parseShareJson(json: string): SharePayload {
  const parsed = JSON.parse(json) as SharePayload;
  validateSharePayload(parsed);
  return parsed;
}

function validateSharePayload(payload: SharePayload): void {
  if (payload.schemaVersion !== LAYOUT_SCHEMA_VERSION) {
    throw new Error(`Unsupported version (expected ${LAYOUT_SCHEMA_VERSION})`);
  }
  if ("column" in payload && payload.column) {
    validateColumn(payload.column);
    return;
  }
  if ("columns" in payload && Array.isArray(payload.columns)) {
    if (payload.columns.length === 0) throw new Error("No columns in layout");
    if (payload.columns.length > MAX_COLUMNS) {
      throw new Error(`Too many columns in file (max ${MAX_COLUMNS})`);
    }
    for (const col of payload.columns) validateColumn(col);
    return;
  }
  throw new Error("Invalid share format: expected column or columns");
}

function validateColumn(col: Omit<FeedColumnConfig, "id">): void {
  if (!VALID_TYPES.has(col.type)) {
    throw new Error(`Invalid column type: ${String(col.type)}`);
  }
  if (!col.title?.trim()) {
    throw new Error("Column must have a title");
  }
  if (col.type === "rss" && !col.rssUrl?.trim()) {
    throw new Error("RSS column must include a feed URL");
  }
}

function normalizeColumn(col: Omit<FeedColumnConfig, "id">): FeedColumnConfig {
  const targetFids =
    col.targetFids ?? (col.targetFid != null ? [col.targetFid] : undefined);
  const queries =
    col.queries ?? (col.query != null ? [col.query] : undefined);

  const normalized = {
    ...col,
    title: col.title.trim(),
  };

  return {
    ...normalized,
    id: crypto.randomUUID(),
    title: migrateChannelColumnTitle({
      type: normalized.type,
      title: normalized.title,
      channelIds: normalized.channelIds,
    }),
    targetFids,
    queries,
    targetFid: undefined,
    query: undefined,
  };
}

/** Turn a share payload into one or more columns to append (skips duplicate Home). */
export function columnsFromSharePayload(
  payload: SharePayload,
  existing: FeedColumnConfig[]
): FeedColumnConfig[] {
  validateSharePayload(payload);

  const raw: Omit<FeedColumnConfig, "id">[] =
    "column" in payload && payload.column
      ? [payload.column]
      : "columns" in payload
        ? payload.columns
        : [];

  const hasHome = existing.some((c) => c.type === "home");
  return raw
    .map(normalizeColumn)
    .filter((c) => !(c.type === "home" && hasHome));
}

export function columnFromSharePayload(
  payload: SharePayload,
  existing: FeedColumnConfig[]
): FeedColumnConfig | null {
  const cols = columnsFromSharePayload(payload, existing);
  return cols[0] ?? null;
}

/** Legacy inline URL (very long). Prefer createColumnShareUrl(). */
export function getColumnShareUrl(column: FeedColumnConfig): string {
  if (typeof window === "undefined") return "";
  const param = encodeShareParam(exportShareableColumn(column));
  return `${window.location.origin}${window.location.pathname}?column=${param}`;
}

/** Create a short ?c= link via the server (R2 or local public storage). */
export async function createColumnShareUrl(
  column: FeedColumnConfig
): Promise<string> {
  const res = await fetch("/api/share/column", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ column }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(
      (data as { error?: string }).error ?? "Failed to create share link"
    );
  }
  const url = (data as { url?: string }).url;
  if (!url) throw new Error("No share URL returned");
  return url;
}

export function getColumnShareUrlFromId(shareId: string): string {
  if (typeof window === "undefined") return "";
  return `${window.location.origin}${window.location.pathname}?c=${shareId}`;
}

export function slugifyColumnTitle(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 40) || "column";
}
