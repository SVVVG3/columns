import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { withCache } from "@/lib/feedCache";
import { fetchCastByHash, normalizeCastHash } from "@/lib/castLookup";

const TTL = 120_000;

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ hash: string }> }
) {
  const session = await getSession();
  if (!session.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { hash } = await params;
  if (!hash) {
    return NextResponse.json({ error: "hash required" }, { status: 400 });
  }

  const id = normalizeCastHash(hash);

  try {
    const cast = await withCache(`cast:${id}`, TTL, () => fetchCastByHash(id));
    return NextResponse.json(cast);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 502 });
  }
}
