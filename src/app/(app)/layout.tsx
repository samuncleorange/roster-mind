import { AppShell } from "@/components/app-shell";
import { getCurrentUser } from "@/lib/auth";
import { getSettings } from "@/lib/data";

export const dynamic = "force-dynamic";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser();
  if (!user) {
    return children;
  }

  const settings = await getSettings();
  return (
    <AppShell user={user} organizationName={settings.organizationName}>
      {children}
    </AppShell>
  );
}
