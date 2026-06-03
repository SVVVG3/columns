import { getSession } from "@/lib/session";
import { AuthScreen } from "@/components/layout/AuthScreen";
import { AppShell } from "@/components/layout/AppShell";

export default async function Home() {
  const session = await getSession();

  if (!session.user) {
    return <AuthScreen />;
  }

  return <AppShell user={session.user} />;
}
