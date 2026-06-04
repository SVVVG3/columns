import { NextRequest, NextResponse } from "next/server";
import { hsnap, apiErrorFromHypersnap } from "@/lib/hypersnap";
import { getSession } from "@/lib/session";
import { withCache } from "@/lib/feedCache";

const TTL = 120_000;

export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const fidsParam = req.nextUrl.searchParams.get("fids") ?? "";
  const fids = fidsParam
    .split(",")
    .map((s) => parseInt(s.trim(), 10))
    .filter((n) => !isNaN(n));

  if (fids.length === 0) {
    return NextResponse.json({ users: [] });
  }

  const sorted = [...fids].sort((a, b) => a - b);
  const cacheKey = `users:${sorted.join(",")}`;

  try {
    const data = await withCache(cacheKey, TTL, () =>
      hsnap<{ users: unknown[] }>("/v2/farcaster/user/bulk", {
        fids: sorted.join(","),
      })
    );
    return NextResponse.json({ users: data.users ?? [] });
  } catch (err: unknown) {
    return apiErrorFromHypersnap(err, "[/api/user/bulk]");
  }
}
