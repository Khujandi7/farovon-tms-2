import type { Metadata } from "next";
import Link from "next/link";
import { AuthShell } from "@/components/auth/auth-shell";
import { ForgotPasswordForm } from "./forgot-password-form";

export const metadata: Metadata = { title: "Восстановление пароля" };

export default function ForgotPasswordPage() {
  return (
    <AuthShell
      title="Забыли пароль?"
      description="Укажите рабочий email — пришлём ссылку для создания нового пароля."
      footer={
        <Link href="/login" className="underline underline-offset-4 hover:text-foreground">
          Вернуться ко входу
        </Link>
      }
    >
      <ForgotPasswordForm />
    </AuthShell>
  );
}
