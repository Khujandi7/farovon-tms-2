import { LogOut } from "lucide-react";
import { signOut } from "@/app/(auth)/actions";
import { Logo } from "@/components/common/logo";
import { NoRoleState } from "@/components/common/states";
import { AppShell } from "@/components/layout/app-shell";
import { Button } from "@/components/ui/button";
import { ToastProvider } from "@/components/workflow/toast";
import { requireSession } from "@/lib/auth/session";
import { ROLE_LABELS } from "@/lib/auth/roles";
import { navItemsForRole } from "@/lib/navigation";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await requireSession();

  if (session.status === "no_access") {
    return (
      <main id="main" className="flex min-h-dvh flex-col items-center justify-center gap-6 px-4">
        <Logo />
        <NoRoleState
          className="w-full max-w-md bg-card"
          action={
            <form action={signOut}>
              <Button type="submit" variant="outline">
                <LogOut /> Выйти
              </Button>
            </form>
          }
        />
      </main>
    );
  }

  const sections = navItemsForRole(session.role).map((i) => i.id);
  return (
    <ToastProvider>
      <AppShell sections={sections} user={{ fullName: session.fullName, email: session.email, roleLabel: ROLE_LABELS[session.role] }}>
        {children}
      </AppShell>
    </ToastProvider>
  );
}
