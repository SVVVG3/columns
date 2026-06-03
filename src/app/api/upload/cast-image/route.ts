import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { verifyCsrf } from "@/lib/csrf";
import {
  isAllowedCastImageType,
  MAX_CAST_IMAGE_BYTES,
} from "@/lib/castImageConstants";
import { uploadCastImage } from "@/lib/castImageUpload";

export async function POST(req: NextRequest) {
  if (!verifyCsrf(req)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const session = await getSession();
  if (!session.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const form = await req.formData();
  const file = form.get("file");
  if (!file || !(file instanceof File)) {
    return NextResponse.json({ error: "file required" }, { status: 400 });
  }

  if (!isAllowedCastImageType(file.type)) {
    return NextResponse.json(
      { error: "Only JPEG, PNG, GIF, and WebP images are supported" },
      { status: 400 }
    );
  }

  if (file.size > MAX_CAST_IMAGE_BYTES) {
    return NextResponse.json({ error: "Image exceeds 3 MB limit" }, { status: 400 });
  }

  const origin = req.headers.get("origin") ?? `https://${req.headers.get("host")}`;

  try {
    const buffer = Buffer.from(await file.arrayBuffer());
    const url = await uploadCastImage(buffer, file.type, origin);
    return NextResponse.json({ url });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Upload failed";
    console.error("[/api/upload/cast-image]", message);
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
