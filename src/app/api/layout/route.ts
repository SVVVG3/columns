import { NextRequest, NextResponse } from "next/server";
import { verifyCsrf } from "@/lib/csrf";
import { upsertColumnsUser } from "@/lib/columnsRegistry";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import { getSession } from "@/lib/session";
import type { FeedColumnConfig, PersistedLayout } from "@/types";

const SCHEMA_VERSION = 3;

function isValidColumn(c: unknown): c is FeedColumnConfig {
  if (!c || typeof c !== "object") return false;
  const col = c as FeedColumnConfig;
  return (
    typeof col.id === "string" &&
    typeof col.type === "string" &&
    typeof col.title === "string"
  );
}

function parseLayoutBody(body: unknown): PersistedLayout | null {
  if (!body || typeof body !== "object") return null;
  const { schemaVersion, columns } = body as PersistedLayout;
  if (schemaVersion !== SCHEMA_VERSION || !Array.isArray(columns)) return null;
  if (!columns.every(isValidColumn)) return null;
  return { schemaVersion: SCHEMA_VERSION, columns };
}

/** GET /api/layout — load saved column board for signed-in user. */
export async function GET() {
  const session = await getSession();
  if (!session.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const sb = getSupabaseAdmin();
  if (!sb) {
    return NextResponse.json({ layout: null, configured: false });
  }

  const { data, error } = await sb
    .from("user_column_layouts")
    .select("schema_version, columns, updated_at")
    .eq("fid", session.user.fid)
    .maybeSingle();

  if (error) {
    console.error("[/api/layout GET]", error.message);
    return NextResponse.json({ error: "Failed to load layout" }, { status: 500 });
  }

  if (!data) {
    return NextResponse.json({ layout: null, configured: true });
  }

  return NextResponse.json({
    configured: true,
    layout: {
      schemaVersion: data.schema_version as 3,
      columns: data.columns as FeedColumnConfig[],
      updatedAt: data.updated_at,
    },
  });
}

/** PUT /api/layout — save column board (debounced from client). */
export async function PUT(req: NextRequest) {
  if (!verifyCsrf(req)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const session = await getSession();
  if (!session.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const sb = getSupabaseAdmin();
  if (!sb) {
    return NextResponse.json({ error: "Supabase not configured" }, { status: 503 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const layout = parseLayoutBody(body);
  if (!layout) {
    return NextResponse.json({ error: "Invalid layout" }, { status: 400 });
  }

  await upsertColumnsUser({
    fid: session.user.fid,
    username: session.user.username,
    displayName: session.user.displayName,
  });

  const now = new Date().toISOString();
  const { error } = await sb.from("user_column_layouts").upsert(
    {
      fid: session.user.fid,
      schema_version: layout.schemaVersion,
      columns: layout.columns,
      updated_at: now,
    },
    { onConflict: "fid" }
  );

  if (error) {
    console.error("[/api/layout PUT]", error.message);
    return NextResponse.json({ error: "Failed to save layout" }, { status: 500 });
  }

  return NextResponse.json({ ok: true, updatedAt: now });
}
