import { NextRequest, NextResponse } from "next/server";
import { getColumnsUserBadge } from "@/lib/columnsRegistry";

/** GET /api/columns-user?fid= — whether this FID has signed into Columns (badge). */
export async function GET(req: NextRequest) {
  const fid = parseInt(req.nextUrl.searchParams.get("fid") ?? "", 10);
  if (Number.isNaN(fid)) {
    return NextResponse.json({ isColumnsUser: false, showBadge: false });
  }

  const badge = await getColumnsUserBadge(fid);
  return NextResponse.json(badge);
}
