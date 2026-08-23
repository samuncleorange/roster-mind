import { AppShell } from "@/components/app-shell";
import { requireCurrentUser } from "@/lib/auth";
import { getSettings } from "@/lib/data";

export const dynamic = "force-dynamic";

export default async function ProtectedLayout({ children }: { children: React.ReactNode }) {
  const [user, settings] = await Promise.all([requireCurrentUser(), getSettings()]);
  return (
    <AppShell user={user} organizationName={settings.organizationName}>
      {children}
    </AppShell>
  );
}
