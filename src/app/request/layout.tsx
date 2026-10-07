import type { Metadata } from "next";
import { Logo } from "@/components/common/logo";

export const metadata: Metadata = {
  title: "Заявка на обучение",
  description: "Подача заявки на обучение в Академию Фаровон",
  robots: { index: false, follow: false, nocache: true },
  referrer: "no-referrer",
};

/** Публичный каркас: без навигации приложения и без данных пользователя. */
export default function RequestLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-dvh bg-muted/30">
      <header className="border-b bg-background">
        <div className="mx-auto flex h-14 w-full max-w-2xl items-center px-4">
          <Logo />
        </div>
      </header>
      <main id="main" className="mx-auto w-full max-w-2xl px-4 py-6 sm:py-10" data-testid="request-portal">
        {children}
      </main>
    </div>
  );
}
