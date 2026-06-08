import { NextRequest, NextResponse } from "next/server";
import { canUseMiniAppColumns } from "@/lib/betaGate";

/** GET /api/miniapp/columns-access?fid= — whether FID may use mini app column viewer. */
export async function GET(req: NextRequest) {
  const fidParam = req.nextUrl.searchParams.get("fid");
  const fid = fidParam ? Number.parseInt(fidParam, 10) : NaN;
  if (Number.isNaN(fid) || fid <= 0) {
    return NextResponse.json({ allowed: false });
  }
  return NextResponse.json({ allowed: canUseMiniAppColumns(fid) });
}
