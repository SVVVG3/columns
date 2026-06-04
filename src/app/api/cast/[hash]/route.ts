import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { withCache } from "@/lib/feedCache";
import { fetchCastByHash, normalizeCastHash } from "@/lib/castLookup";
import { apiErrorFromHypersnap } from "@/lib/hypersnap";

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
    if (!cast) {
      return NextResponse.json({ error: "Cast not found" }, { status: 404 });
    }
    return NextResponse.json(cast);
  } catch (err: unknown) {
    return apiErrorFromHypersnap(err, "[/api/cast/[hash]]");
  }
}
