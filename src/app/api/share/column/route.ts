import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import {
  exportShareableColumn,
  parseShareJson,
  type ShareableColumn,
} from "@/lib/layoutShare";
import {
  generateColumnShareId,
  isValidColumnShareId,
  loadColumnShareJson,
  storeColumnShareJson,
} from "@/lib/columnShareStorage";
import type { FeedColumnConfig } from "@/types";

function appOrigin(req: NextRequest): string {
  const env = process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "");
  if (env) return env;
  return new URL(req.url).origin;
}

/** POST — store column config, return short share URL. */
export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  try {
    const column = (body as { column?: FeedColumnConfig }).column;
    if (!column?.title || !column?.type) {
      return NextResponse.json({ error: "column required" }, { status: 400 });
    }

    const shareable: ShareableColumn = exportShareableColumn(column);
    const json = JSON.stringify(shareable);
    const id = generateColumnShareId();
    await storeColumnShareJson(id, json);

    const origin = appOrigin(req);
    const url = `${origin}/?c=${id}`;

    return NextResponse.json({ id, url });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Failed to create share link";
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}

/** GET — resolve short id to shareable column JSON. */
export async function GET(req: NextRequest) {
  const id = new URL(req.url).searchParams.get("id");
  if (!id || !isValidColumnShareId(id)) {
    return NextResponse.json({ error: "Invalid share id" }, { status: 400 });
  }

  const json = await loadColumnShareJson(id);
  if (!json) {
    return NextResponse.json({ error: "Share not found" }, { status: 404 });
  }

  try {
    const payload = parseShareJson(json);
    return NextResponse.json(payload);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Invalid share data";
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}
