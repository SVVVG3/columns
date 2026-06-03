import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { withCache } from "@/lib/feedCache";
import { fetchCastByHash, normalizeCastHash } from "@/lib/castLookup";

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
          try {
            const cast = await withCache(
              `cast:${hash}`,
              TTL,
              () => fetchCastByHash(hash)
            );
            return [hash, cast] as const;
          } catch {
            return null;
          }
        })
      );
      return Object.fromEntries(
        entries.filter((e): e is [string, Record<string, unknown>] => e !== null)
      );
    });

    return NextResponse.json({ casts });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[/api/cast/bulk]", msg);
    return NextResponse.json({ error: msg }, { status: 502 });
  }
}
