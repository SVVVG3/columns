import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { withCache } from "@/lib/feedCache";
import { fetchCastByHash, normalizeCastHash } from "@/lib/castLookup";
import { apiErrorFromHypersnap } from "@/lib/hypersnap";

const TTL = 120_000;
const MAX_HASHES = 40;

export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const raw = req.nextUrl.searchParams.get("hashes") ?? "";
  const hashes = [
    ...new Set(
      raw
        .split(",")
        .map((h) => h.trim())
        .filter(Boolean)
        .map(normalizeCastHash)
    ),
  ].slice(0, MAX_HASHES);

  if (hashes.length === 0) {
    return NextResponse.json({ casts: {} });
  }

  const cacheKey = `cast-bulk:${session.user.fid}:${hashes.join(",")}`;

  try {
    const casts = await withCache(cacheKey, TTL, async () => {
      const entries = await Promise.all(
        hashes.map(async (hash) => {
          const cast = await withCache(`cast:${hash}`, TTL, () => fetchCastByHash(hash));
          if (!cast) return null;
          return [hash, cast] as const;
        })
      );
      return Object.fromEntries(
        entries.filter((e): e is [string, Record<string, unknown>] => e !== null)
      );
    });

    return NextResponse.json({ casts });
  } catch (err: unknown) {
    return apiErrorFromHypersnap(err, "[/api/cast/bulk]");
  }
}
