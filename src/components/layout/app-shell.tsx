import Link from "next/link";
import { Logo } from "@/components/common/logo";
import { ThemeToggle } from "@/components/common/theme-toggle";
import { NotificationBell } from "@/components/notifications/notification-bell";
import { CommandPalette } from "@/components/search/command-palette";
import { MobileNav } from "@/components/layout/mobile-nav";
import { SidebarNav } from "@/components/layout/sidebar-nav";
import { UserMenu } from "@/components/layout/user-menu";
import type { SectionId } from "@/lib/auth/roles";

type ShellProps = {
  children: React.ReactNode;
  sections: SectionId[];
  user: { fullName: string; email: string | null; roleLabel: string | null };
};

export function AppShell({ children, sections, user }: ShellProps) {
  return (
    <div className="flex min-h-dvh">
      <aside
        className="sticky top-0 hidden h-dvh w-60 shrink-0 flex-col border-r border-sidebar-border bg-sidebar px-3 py-4 lg:flex"
        data-testid="sidebar"
      >
        <Link href="/dashboard" className="mb-6 rounded-md px-1.5 py-1 outline-none focus-visible:ring-2 focus-visible:ring-ring/40">
          <Logo />
        </Link>
        <SidebarNav sections={sections} />
        <div className="mt-auto px-2 pt-4 text-[11px] leading-relaxed text-muted-foreground">
          Источник данных — база FAROVON TMS. Все суммы и показатели рассчитывает база.
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex h-14 items-center gap-2 border-b bg-background/85 px-3 backdrop-blur supports-[backdrop-filter]:bg-background/70 sm:px-5">
          <MobileNav sections={sections} />
          <Link href="/dashboard" className="lg:hidden" aria-label="FAROVON TMS">
            <Logo compact />
          </Link>
          <span className="hidden text-sm font-medium text-muted-foreground lg:inline">FAROVON TMS 2.0</span>
          <div className="ml-auto flex items-center gap-1">
            <CommandPalette />
            <NotificationBell />
            <ThemeToggle />
            <UserMenu {...user} />
          </div>
        </header>
        <main id="main" className="mx-auto w-full max-w-7xl flex-1 px-4 py-6 sm:px-6 lg:px-8">
          {children}
        </main>
      </div>
    </div>
  );
}
