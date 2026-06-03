import { NextRequest, NextResponse } from "next/server";
import { hsnap } from "@/lib/hypersnap";
import { getSession } from "@/lib/session";

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

  try {
    // Hypersnap returns { users: [...] } — same shape as Neynar's fetchBulkUsers
    const data = await hsnap<{ users: unknown[] }>("/v2/farcaster/user/bulk", {
      fids: fids.join(","),
    });
    return NextResponse.json({ users: data.users ?? [] });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 502 });
  }
}
