import { isBetaGateEnabled } from "@/lib/betaGate";
import { canUseFullColumnsApp } from "@/lib/profileAccess";
import { getSession } from "@/lib/session";
import { AuthScreen } from "@/components/layout/AuthScreen";
import { AppShell } from "@/components/layout/AppShell";
import { ProfileOnlyHome } from "@/components/profile/ProfileOnlyHome";

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
    return <ProfileOnlyHome user={session.user} />;
  }

  return <AppShell user={session.user} />;
}
