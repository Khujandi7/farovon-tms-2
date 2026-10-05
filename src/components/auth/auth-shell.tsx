import { Logo } from "@/components/common/logo";
import { ThemeToggle } from "@/components/common/theme-toggle";

/** Каркас страниц без боковой панели: вход, восстановление и установка пароля. */
export function AuthShell({ title, description, children, footer }: { title: string; description?: string; children: React.ReactNode; footer?: React.ReactNode }) {
  return (
    <div className="relative flex min-h-dvh flex-col bg-background">
      <div aria-hidden="true" className="pointer-events-none absolute inset-x-0 top-0 h-72 bg-[radial-gradient(60%_100%_at_50%_0%,var(--brand-soft),transparent)]" />
      <header className="relative flex items-center justify-between px-4 py-4 sm:px-8">
        <Logo />
        <ThemeToggle />
      </header>
      <main className="relative flex flex-1 items-center justify-center px-4 pb-16">
        <div className="w-full max-w-sm">
          <div className="mb-6 space-y-1.5 text-center">
            <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
            {description && <p className="text-sm text-muted-foreground">{description}</p>}
          </div>
          <div className="rounded-xl border bg-card p-6 shadow-sm">{children}</div>
          {footer && <div className="mt-6 text-center text-xs leading-relaxed text-muted-foreground">{footer}</div>}
        </div>
      </main>
    </div>
  );
}
