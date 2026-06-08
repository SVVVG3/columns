import type { Metadata } from "next";
import { MiniAppProfileClient } from "@/components/profile/MiniAppProfileClient";
import { getSession } from "@/lib/session";
import { lookupUserByFid } from "@/lib/userSearch";
import { redirect } from "next/navigation";

export const metadata: Metadata = {
  title: "My Profile · Columns",
  description: "Edit your Columns Top 8 and share your profile on Farcaster",
};

export default async function ProfileMePage() {
  const session = await getSession();
  if (session.user?.username) {
    redirect(`/profile/${encodeURIComponent(session.user.username)}`);
  }

  if (session.user?.fid) {
    const user = await lookupUserByFid(session.user.fid);
    if (user?.username) {
      redirect(`/profile/${encodeURIComponent(user.username)}`);
    }
  }

  return <MiniAppProfileClient username="" isMeRoute />;
}
