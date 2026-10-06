import type { Metadata } from "next";
import Link from "next/link";
import { Building2, Users } from "lucide-react";
import { SectionPage } from "@/components/common/section-page";
import { ThemeToggle } from "@/components/common/theme-toggle";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ChangePasswordForm } from "@/components/account/change-password-form";
import { Button } from "@/components/ui/button";
import { ROLE_LABELS, canWrite } from "@/lib/auth/roles";
import { can } from "@/lib/workflows/roles";

export const metadata: Metadata = { title: "Настройки" };

export default function SettingsPage() {
  return (
    <SectionPage section="settings">
      {(session) => (
        <div className="grid gap-4 lg:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle>Профиль</CardTitle>
              <CardDescription>Данные учётной записи. Роль назначает администратор.</CardDescription>
            </CardHeader>
            <CardContent>
              <dl className="grid grid-cols-[8rem_1fr] gap-y-3 text-sm">
                <dt className="text-muted-foreground">ФИО</dt>
                <dd className="font-medium break-words">{session.fullName}</dd>
                <dt className="text-muted-foreground">Email</dt>
                <dd className="break-all">{session.email ?? "—"}</dd>
                <dt className="text-muted-foreground">Роль</dt>
                <dd>
                  <span className="rounded-md bg-brand-soft px-2 py-0.5 text-xs font-medium text-brand">{ROLE_LABELS[session.role]}</span>
                </dd>
              </dl>
            </CardContent>
          </Card>
          {canWrite(session.role, "users") && (
            <Card>
              <CardHeader>
                <CardTitle>Пользователи и роли</CardTitle>
                <CardDescription>Приглашения, смена ролей, деактивация, сброс пароля.</CardDescription>
              </CardHeader>
              <CardContent>
                <Button asChild variant="outline">
                  <Link href="/settings/users">
                    <Users /> Управление пользователями
                  </Link>
                </Button>
              </CardContent>
            </Card>
          )}
          {can(session.role, "references") && (
            <Card>
              <CardHeader>
                <CardTitle>Справочники</CardTitle>
                <CardDescription>Департаменты и отделы организации.</CardDescription>
              </CardHeader>
              <CardContent>
                <Button asChild variant="outline">
                  <Link href="/settings/references">
                    <Building2 /> Подразделения
                  </Link>
                </Button>
              </CardContent>
            </Card>
          )}
          <Card>
            <CardHeader>
              <CardTitle>Пароль</CardTitle>
              <CardDescription>Смена собственного пароля. Роль и статус учётной записи здесь не меняются.</CardDescription>
            </CardHeader>
            <CardContent>
              <ChangePasswordForm />
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>Оформление</CardTitle>
              <CardDescription>Светлая, тёмная или как в системе.</CardDescription>
            </CardHeader>
            <CardContent>
              <ThemeToggle />
            </CardContent>
          </Card>
        </div>
      )}
    </SectionPage>
  );
}
