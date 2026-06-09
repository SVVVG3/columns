import { NextResponse } from "next/server";
import { getAppUrl } from "@/lib/appUrl";
import {
  homeMiniAppEmbedImageUrl,
  MINIAPP_SPLASH_BACKGROUND,
} from "@/lib/miniappShare";

export async function GET() {
  const appUrl = getAppUrl();
  // Farcaster requires `frame` and `miniapp` to be identical when both are set.
  const appConfig = {
    version: "1" as const,
    name: "Columns",
    iconUrl: `${appUrl}/columns-logo.png`,
    homeUrl: `${appUrl}/columns`,
    imageUrl: homeMiniAppEmbedImageUrl(),
    buttonTitle: "My Columns",
    splashImageUrl: `${appUrl}/columns-logo.png`,
    splashBackgroundColor: MINIAPP_SPLASH_BACKGROUND,
    subtitle: "Multi-Column Farcaster Client",
    description:
      "Build, view, and share custom Columns using the Farcaster social graph and more",
    primaryCategory: "social" as const,
    tags: ["farcaster", "profiles", "social"],
  };

  const manifest = {
    accountAssociation: {
      header:
        "eyJmaWQiOjQ2NjExMSwidHlwZSI6ImF1dGgiLCJrZXkiOiIweEJiMTRkQjlmNjBlODA2ODQ2MzM1Zjc5NDgxRDk5OGFiYzY2RWZDMjAifQ",
      payload: "eyJkb21haW4iOiJteWNvbHVtbnMueHl6In0",
      signature:
        "5HvNyiK3OZM6uZREI5/QRWGSODWAXSS6UyzBikPrcZ9rLtx90GAzRrviZE1RC9iOAWXaDrmRnBuGx93AyCFfJBs=",
    },
    miniapp: appConfig,
    frame: appConfig,
  };

  return NextResponse.json(manifest, {
    headers: {
      "Cache-Control": "public, max-age=3600",
    },
  });
}
