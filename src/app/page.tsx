import { redirect } from "next/navigation";
import { isBetaGateEnabled } from "@/lib/betaGate";
import { canUseFullColumnsApp } from "@/lib/profileAccess";
import { getSession } from "@/lib/session";
import { AuthScreen } from "@/components/layout/AuthScreen";
import { AppShell } from "@/components/layout/AppShell";

export default async function Home() {
  const session = await getSession();

  if (!session.user) {
    return (
      <AuthScreen
        betaGateEnabled={isBetaGateEnabled()}
        betaUnlocked={!!session.betaUnlocked}
      />
    );
  }

  if (!canUseFullColumnsApp(session.user)) {
    redirect("/profile/me");
  }

  return <AppShell user={session.user} />;
}
