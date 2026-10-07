"use client";

import { useTransition } from "react";
import Link from "next/link";
import { Bell } from "lucide-react";
import { markNotificationsRead } from "@/app/(app)/notifications/actions";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { notificationTypeLabel, safeInternalHref } from "@/lib/portal/notification-types";
import type { NotificationItem } from "@/lib/portal/notifications-server";
import { cn } from "@/lib/utils";

export function NotificationBellMenu({ items, unread }: { items: NotificationItem[]; unread: number }) {
  const [pending, start] = useTransition();
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className="relative size-10 sm:size-9" aria-label={unread > 0 ? `Уведомления, непрочитанных: ${unread}` : "Уведомления"} data-testid="notification-bell">
          <Bell aria-hidden="true" />
          {unread > 0 && (
            <span className="absolute -top-0.5 -right-0.5 grid min-w-4 place-items-center rounded-full bg-brand px-1 text-[10px] leading-4 font-semibold text-white" data-testid="notification-count">
              {unread > 99 ? "99+" : unread}
            </span>
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-[min(24rem,calc(100vw-1.5rem))] p-0" data-testid="notification-menu">
        <DropdownMenuLabel className="flex items-center justify-between gap-2 px-3 py-2.5 font-semibold">
          Уведомления
          {unread > 0 && (
            <button
              type="button"
              className="rounded px-1.5 py-1 text-xs font-normal text-muted-foreground hover:text-foreground disabled:opacity-50"
              disabled={pending}
              onClick={(e) => {
                e.preventDefault();
                start(async () => {
                  await markNotificationsRead({ ids: null });
                });
              }}
            >
              Отметить все прочитанными
            </button>
          )}
        </DropdownMenuLabel>
        <DropdownMenuSeparator className="m-0" />
        <div className="max-h-[60vh] overflow-y-auto p-1">
          {items.length === 0 ? (
            <p className="px-3 py-6 text-center text-sm text-muted-foreground">Новых уведомлений нет</p>
          ) : (
            items.map((n) => {
              const href = safeInternalHref(n.href) ?? "/notifications";
              return (
                <DropdownMenuItem key={n.id} asChild className="items-start gap-2 py-2.5">
                  <Link href={href} className="flex min-h-10 w-full">
                    <span className={cn("mt-1.5 size-2 shrink-0 rounded-full", n.read ? "bg-transparent" : n.severity === "CRITICAL" ? "bg-destructive" : n.severity === "WARNING" ? "bg-warning" : "bg-brand")} aria-hidden="true" />
                    <span className="min-w-0 flex-1">
                      <span className={cn("block text-sm break-words", !n.read && "font-medium")}>{n.title}</span>
                      {n.body && <span className="block truncate text-xs text-muted-foreground">{n.body}</span>}
                      <span className="block text-[11px] text-muted-foreground">{notificationTypeLabel(n.type)}</span>
                    </span>
                  </Link>
                </DropdownMenuItem>
              );
            })
          )}
        </div>
        <DropdownMenuSeparator className="m-0" />
        <DropdownMenuItem asChild className="justify-center rounded-t-none py-2.5 text-sm font-medium">
          <Link href="/notifications" data-testid="notifications-all">Все уведомления</Link>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
