"use client";

import { useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { CheckCheck, Loader2 } from "lucide-react";
import { markNotificationsRead } from "@/app/(app)/notifications/actions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/workflow/toast";
import { formatDate } from "@/lib/format";
import { SEVERITY_LABELS, notificationTypeLabel, safeInternalHref } from "@/lib/portal/notification-types";
import type { NotificationItem } from "@/lib/portal/notifications-server";
import { cn } from "@/lib/utils";

export function NotificationsList({ items, unreadTotal }: { items: NotificationItem[]; unreadTotal: number }) {
  const router = useRouter();
  const { notify } = useToast();
  const [pending, start] = useTransition();

  function mark(ids: string[] | null) {
    start(async () => {
      const r = await markNotificationsRead({ ids });
      if (r.ok) router.refresh();
      else notify(false, r.error);
    });
  }

  return (
    <div className="space-y-3">
      {unreadTotal > 0 && (
        <div className="flex justify-end">
          <Button variant="outline" className="h-10" onClick={() => mark(null)} disabled={pending} data-testid="mark-all-read">
            {pending ? <Loader2 className="animate-spin" /> : <CheckCheck />} Отметить все прочитанными
          </Button>
        </div>
      )}
      <ul className="divide-y rounded-xl border bg-card" data-testid="notifications-list">
        {items.map((n) => {
          const href = safeInternalHref(n.href);
          return (
            <li key={n.id} className="flex flex-col gap-2 p-4 sm:flex-row sm:items-start sm:justify-between" data-testid="notification-row">
              <div className="min-w-0 space-y-1">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant={n.severity === "CRITICAL" ? "brand" : n.severity === "WARNING" ? "warning" : "secondary"}>{SEVERITY_LABELS[n.severity] ?? n.severity}</Badge>
                  <span className="text-xs text-muted-foreground">{notificationTypeLabel(n.type)} · {formatDate(n.created_at)}</span>
                  {!n.read && <span className="text-xs font-medium text-brand">новое</span>}
                </div>
                <p className={cn("text-sm break-words", !n.read && "font-medium")}>
                  {href ? (
                    <Link href={href} className="underline-offset-4 hover:underline">
                      {n.title}
                    </Link>
                  ) : (
                    n.title
                  )}
                </p>
                {n.body && <p className="text-sm text-muted-foreground break-words">{n.body}</p>}
              </div>
              {!n.read && (
                <Button variant="ghost" className="h-10 shrink-0 self-start" onClick={() => mark([n.id])} disabled={pending}>
                  Прочитано
                </Button>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
