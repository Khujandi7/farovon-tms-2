import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AuthShell } from "@/components/auth/auth-shell";
import { NoRoleState } from "@/components/common/states";
import { getSession } from "@/lib/auth/session";
import { SetPasswordForm } from "./set-password-form";

export const metadata: Metadata = { title: "Создание пароля" };

export default async function SetPasswordPage() {
  const session = await getSession();
  if (session.status === "anonymous") redirect("/auth/error");
  if (session.status === "no_access") {
    return (
      <AuthShell title="Создание пароля">
        <NoRoleState compact />
      </AuthShell>
    );
  }
  return (
    <AuthShell title="Создайте пароль" description={`${session.fullName}, задайте пароль для входа в FAROVON TMS.`}>
      <SetPasswordForm />
    </AuthShell>
  );
}
