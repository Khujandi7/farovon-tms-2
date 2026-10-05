"use client";

import { useMemo, useState, useTransition } from "react";
import type { ColumnDef } from "@tanstack/react-table";
import { KeyRound, Loader2, MoreHorizontal, Send, ShieldCheck, UserCheck, UserPlus, UserX } from "lucide-react";
import { DataTable } from "@/components/data-table/data-table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { AlertDialog, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { FormAlert, FormSuccess } from "@/components/auth/form-parts";
import { InviteUserDialog } from "./invite-user-dialog";
import { ChangeRoleDialog } from "./change-role-dialog";
import { resendInvite, sendPasswordReset, setUserActive } from "@/app/(app)/settings/users/actions";
import { ROLE_LABELS } from "@/lib/auth/roles";
import { formatDate } from "@/lib/format";
import type { UserRow } from "@/lib/users/types";
import type { ActionResult } from "@/lib/users/schemas";

const STATUS_LABEL = { active: "Активен", invited: "Приглашён", inactive: "Деактивирован" } as const;
const STATUS_VARIANT = { active: "success", invited: "warning", inactive: "secondary" } as const;

function formatDateTime(value: string | null): string {
  if (!value) return "—";
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? "—" : `${formatDate(value.slice(0, 10))} ${d.toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" })}`;
}

export function UsersManager({ users, currentUserId }: { users: UserRow[]; currentUserId: string }) {
  const [pending, startTransition] = useTransition();
  const [notice, setNotice] = useState<{ ok: boolean; text: string } | null>(null);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [roleTarget, setRoleTarget] = useState<UserRow | null>(null);
  const [deactivateTarget, setDeactivateTarget] = useState<UserRow | null>(null);

  function run(task: () => Promise<ActionResult>) {
    setNotice(null);
    startTransition(async () => {
      const result = await task();
      setNotice(result.ok ? { ok: true, text: result.message ?? "Готово." } : { ok: false, text: result.error });
    });
  }

  const columns = useMemo<ColumnDef<UserRow, unknown>[]>(
    () => [
      {
        accessorKey: "fullName",
        header: "ФИО",
        cell: ({ row }) => (
          <span className="font-medium">
            {row.original.fullName}
            {row.original.id === currentUserId && <span className="ml-2 text-xs font-normal text-muted-foreground">(вы)</span>}
          </span>
        ),
      },
      { accessorKey: "email", header: "Email", cell: ({ row }) => <span className="break-all">{row.original.email ?? "—"}</span> },
      { accessorKey: "role", header: "Роль", cell: ({ row }) => <Badge variant="brand">{ROLE_LABELS[row.original.role]}</Badge> },
      {
        accessorKey: "status",
        header: "Статус",
        cell: ({ row }) => <Badge variant={STATUS_VARIANT[row.original.status]}>{STATUS_LABEL[row.original.status]}</Badge>,
      },
      {
        id: "invited",
        header: "Приглашён / подтверждён",
        accessorFn: (u) => u.invitedAt ?? u.createdAt,
        cell: ({ row }) => (
          <div className="text-xs leading-relaxed whitespace-nowrap text-muted-foreground">
            <div>{formatDateTime(row.original.invitedAt)}</div>
            <div>{row.original.confirmedAt ? formatDateTime(row.original.confirmedAt) : "не подтверждён"}</div>
          </div>
        ),
      },
      {
        accessorKey: "lastSignInAt",
        header: "Последний вход",
        cell: ({ row }) => <span className="text-xs whitespace-nowrap">{formatDateTime(row.original.lastSignInAt)}</span>,
      },
      {
        id: "actions",
        header: () => <span className="sr-only">Действия</span>,
        enableSorting: false,
        cell: ({ row }) => {
          const u = row.original;
          if (u.id === currentUserId) return <span className="text-xs text-muted-foreground">—</span>;
          return (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" aria-label={`Действия: ${u.fullName}`} disabled={pending}>
                  <MoreHorizontal />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                {u.isActive && (
                  <DropdownMenuItem onSelect={() => setRoleTarget(u)}>
                    <ShieldCheck /> Изменить роль
                  </DropdownMenuItem>
                )}
                {u.isActive && u.status === "invited" && (
                  <DropdownMenuItem onSelect={() => run(() => resendInvite({ userId: u.id }))}>
                    <Send /> Повторно отправить приглашение
                  </DropdownMenuItem>
                )}
                {u.isActive && u.status === "active" && (
                  <DropdownMenuItem onSelect={() => run(() => sendPasswordReset({ userId: u.id }))}>
                    <KeyRound /> Отправить ссылку сброса пароля
                  </DropdownMenuItem>
                )}
                <DropdownMenuSeparator />
                {u.isActive ? (
                  <DropdownMenuItem className="text-destructive focus:text-destructive" onSelect={() => setDeactivateTarget(u)}>
                    <UserX /> Деактивировать
                  </DropdownMenuItem>
                ) : (
                  <DropdownMenuItem onSelect={() => run(() => setUserActive({ userId: u.id, active: true }))}>
                    <UserCheck /> Восстановить доступ
                  </DropdownMenuItem>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          );
        },
      },
    ],
    [currentUserId, pending],
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">
          {users.length} {users.length === 1 ? "пользователь" : "пользователей"}. Регистрации нет: доступ выдаётся только по приглашению.
        </p>
        <Button onClick={() => setInviteOpen(true)}>
          <UserPlus /> Пригласить пользователя
        </Button>
      </div>

      <div aria-live="polite" className="space-y-2">
        {pending && (
          <p className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin" aria-hidden="true" /> Выполняется…
          </p>
        )}
        {notice && (notice.ok ? <FormSuccess message={notice.text} /> : <FormAlert error={notice.text} />)}
      </div>

      <DataTable columns={columns} data={users} searchPlaceholder="Поиск по ФИО или email…" emptyTitle="Пользователей пока нет" emptyDescription="Пригласите первого сотрудника кнопкой выше." />

      <InviteUserDialog open={inviteOpen} onOpenChange={setInviteOpen} onDone={(text) => setNotice({ ok: true, text })} />
      <ChangeRoleDialog target={roleTarget} onClose={() => setRoleTarget(null)} onDone={(text) => setNotice({ ok: true, text })} />

      <AlertDialog open={deactivateTarget !== null} onOpenChange={(open) => !open && setDeactivateTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Деактивировать пользователя?</AlertDialogTitle>
            <AlertDialogDescription>
              {deactivateTarget?.fullName} потеряет доступ к системе сразу. Данные и история сохранятся, доступ можно восстановить.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Отмена</AlertDialogCancel>
            <Button
              variant="destructive"
              onClick={() => {
                const target = deactivateTarget;
                setDeactivateTarget(null);
                if (target) run(() => setUserActive({ userId: target.id, active: false }));
              }}
            >
              Деактивировать
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
