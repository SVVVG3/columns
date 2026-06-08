import type { Metadata } from "next";
import { MiniAppProfileClient } from "@/components/profile/MiniAppProfileClient";
import {
  buildProfileFrameEmbedJson,
  buildProfileMiniAppEmbed,
} from "@/lib/miniappShare";

interface PageProps {
  params: Promise<{ username: string }>;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { username } = await params;
  const decoded = decodeURIComponent(username).replace(/^@/, "");
  const miniapp = buildProfileMiniAppEmbed(decoded);
  const miniappJson = JSON.stringify(miniapp);
  const frameJson = buildProfileFrameEmbedJson(decoded);

  return {
    title: `@${decoded} · Columns`,
    description: `Columns profile and Top 8 for @${decoded}`,
    openGraph: {
      title: `@${decoded} on Columns`,
      description: "View Top 8 and Columns profile",
      images: [{ url: miniapp.imageUrl, width: 1200, height: 800 }],
    },
    other: {
      "fc:miniapp": miniappJson,
      "fc:frame": frameJson,
    },
  };
}

export default async function ProfileSharePage({ params }: PageProps) {
  const { username } = await params;
  const decoded = decodeURIComponent(username).replace(/^@/, "");
  return <MiniAppProfileClient username={decoded} />;
}
