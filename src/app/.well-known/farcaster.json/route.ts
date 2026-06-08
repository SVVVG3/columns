import { NextResponse } from "next/server";
import { getAppUrl } from "@/lib/appUrl";
import { homeMiniAppEmbedImageUrl } from "@/lib/miniappShare";

export async function GET() {
  const appUrl = getAppUrl();
  // Farcaster requires `frame` and `miniapp` to be identical when both are set.
  const appConfig = {
    version: "1" as const,
    name: "Columns",
    iconUrl: `${appUrl}/columns-logo.png`,
    homeUrl: `${appUrl}/profile/me`,
    imageUrl: homeMiniAppEmbedImageUrl(),
    buttonTitle: "My Profile",
    splashImageUrl: `${appUrl}/columns-logo.png`,
    splashBackgroundColor: "#0c0c0f",
    subtitle: "Top 8 on Columns",
    description:
      "View Columns profiles, curate your Top 8 friends, and share embeddable profile cards on Farcaster.",
    primaryCategory: "social" as const,
    tags: ["farcaster", "profiles", "social"],
  };

  const manifest = {
    accountAssociation: {
      header: "",
      payload: "",
      signature: "",
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
