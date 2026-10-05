import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { PageHeader } from "@/components/common/page-header";
import { ErrorState, ForbiddenState } from "@/components/common/states";
import { UsersManager } from "@/components/users/users-manager";
import { requireSession } from "@/lib/auth/session";
import { canManageUsers } from "@/lib/users/policy";
import { listUserRows } from "@/lib/users/service";
import type { UserRow } from "@/lib/users/types";
import { ERR } from "@/lib/users/errors";

export const metadata: Metadata = { title: "Пользователи" };
export const dynamic = "force-dynamic";

/** Доступно только ADMIN. Проверка на сервере: прямой URL для других ролей показывает отказ, данные не загружаются. */
export default async function UsersPage() {
  const session = await requireSession();
  const allowed = session.status === "ok" && canManageUsers(session.role);

  let users: UserRow[] = [];
  let loadError: string | null = null;
  if (allowed) {
    try {
      users = await listUserRows();
    } catch (e) {
      console.error("[users] listUserRows", e instanceof Error ? e.message : e);
      loadError = process.env.SUPABASE_SERVICE_ROLE_KEY ? ERR.unavailable : ERR.notConfigured;
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader title="Пользователи" description="Приглашения, роли и доступ сотрудников. Роль определяет, какие данные видит пользователь." />
      {!allowed || session.status !== "ok" ? (
        <ForbiddenState className="bg-card" title="Нет доступа к разделу" description="Управлять пользователями может только администратор." />
      ) : loadError ? (
        <ErrorState className="bg-card" title="Не удалось загрузить пользователей" description={loadError} />
      ) : (
        <UsersManager users={users} currentUserId={session.userId} />
      )}
      <Link href="/settings" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" aria-hidden="true" /> Настройки
      </Link>
    </div>
  );
}
