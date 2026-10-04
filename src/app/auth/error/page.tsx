import Link from "next/link";
import { ErrorState } from "@/components/common/states";
import { Button } from "@/components/ui/button";

export default function AuthErrorPage() {
  return (
    <main className="flex min-h-dvh items-center justify-center px-4">
      <ErrorState
        className="w-full max-w-md bg-card"
        title="Ошибка авторизации"
        description="Ссылка устарела или вход не удался. Попробуйте войти ещё раз."
        action={
          <Button asChild>
            <Link href="/login">Перейти ко входу</Link>
          </Button>
        }
      />
    </main>
  );
}
