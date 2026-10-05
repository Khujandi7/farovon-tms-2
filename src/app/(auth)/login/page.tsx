import type { Metadata } from "next";
import Link from "next/link";
import { Logo } from "@/components/common/logo";
import { ThemeToggle } from "@/components/common/theme-toggle";
import { LoginForm } from "./login-form";
import { safeNextPath } from "@/lib/auth/routes";

export const metadata: Metadata = { title: "Вход" };

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string | string[]; error?: string }> }) {
  const params = await searchParams;
  const rawNext = Array.isArray(params.next) ? params.next[0] : params.next;
  const next = rawNext ? safeNextPath(rawNext) : undefined;

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
            <h1 className="text-2xl font-semibold tracking-tight">Вход в FAROVON TMS</h1>
            <p className="text-sm text-muted-foreground">Система управления обучением ГК «Фаровон»</p>
          </div>
          <div className="rounded-xl border bg-card p-6 shadow-sm">
            <LoginForm next={next} />
          </div>
          <p className="mt-4 text-center text-sm">
            <Link href="/forgot-password" className="text-muted-foreground underline underline-offset-4 hover:text-foreground">
              Забыли пароль?
            </Link>
          </p>
          <p className="mt-4 text-center text-xs leading-relaxed text-muted-foreground">
            Регистрации нет: учётные записи создаёт администратор по приглашению. Нет доступа — обратитесь к администратору FAROVON TMS.
          </p>
        </div>
      </main>
    </div>
  );
}
