import { NextResponse } from "next/server";
import { getAppUrl } from "@/lib/appUrl";

export async function GET() {
  const appUrl = getAppUrl();
  const manifest = {
    accountAssociation: {
      header: "",
      payload: "",
      signature: "",
    },
    miniapp: {
      version: "1",
      name: "Columns",
      iconUrl: `${appUrl}/columns-logo.png`,
      homeUrl: `${appUrl}/profile/me`,
      imageUrl: `${appUrl}/og-image.png`,
      buttonTitle: "My Profile",
      splashImageUrl: `${appUrl}/columns-logo.png`,
      splashBackgroundColor: "#0c0c0f",
      subtitle: "Top 8 profiles on Columns",
      description:
        "View Columns profiles, curate your Top 8 friends, and share embeddable profile cards on Farcaster.",
      primaryCategory: "social",
      tags: ["farcaster", "profiles", "social"],
    },
    frame: {
      version: "1",
      name: "Columns",
      iconUrl: `${appUrl}/columns-logo.png`,
      homeUrl: `${appUrl}/profile/me`,
      imageUrl: `${appUrl}/og-image.png`,
      buttonTitle: "My Profile",
      splashImageUrl: `${appUrl}/columns-logo.png`,
      splashBackgroundColor: "#0c0c0f",
    },
  };

  return NextResponse.json(manifest, {
    headers: {
      "Cache-Control": "public, max-age=3600",
    },
  });
}
