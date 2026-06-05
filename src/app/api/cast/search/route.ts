import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import {
  normalizeCastSearchResponse,
  type RawCastSearchResponse,
} from "@/lib/castSearch";
import { filterRootCasts } from "@/lib/castFilters";
import { normalizeCast } from "@/lib/normalizeCast";
import { apiErrorFromHypersnap, hsnap } from "@/lib/hypersnap";

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 25;

export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const q = searchParams.get("q")?.trim();
  if (!q) {
    return NextResponse.json({ casts: [] });
  }

  const limit = Math.min(
    Math.max(Number(searchParams.get("limit")) || DEFAULT_LIMIT, 1),
    MAX_LIMIT
  );

  try {
    const raw = await hsnap<RawCastSearchResponse>(
      "/v2/farcaster/cast/search",
      { q, limit }
    );
    const { casts: rows } = normalizeCastSearchResponse(raw);
    const casts = filterRootCasts(rows).map(normalizeCast);
    return NextResponse.json({ casts });
  } catch (err: unknown) {
    return apiErrorFromHypersnap(err, "[/api/cast/search]");
  }
}
