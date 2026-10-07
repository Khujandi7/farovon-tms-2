import type { Metadata } from "next";
import Link from "next/link";
import { Bell } from "lucide-react";
import { PageHeader } from "@/components/common/page-header";
import { EmptyState, ErrorState, NoRoleState } from "@/components/common/states";
import { NotificationsList } from "@/components/notifications/notifications-list";
import { requireSession } from "@/lib/auth/session";
import { NOTIFICATION_TYPES, NOTIFICATION_TYPE_LABELS, isNotificationType } from "@/lib/portal/notification-types";
import { loadNotifications } from "@/lib/portal/notifications-server";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Уведомления" };
export const dynamic = "force-dynamic";

export default async function NotificationsPage({ searchParams }: { searchParams: Promise<{ type?: string | string[]; unread?: string | string[] }> }) {
  const sp = await searchParams;
  const session = await requireSession();
  const type = typeof sp.type === "string" && isNotificationType(sp.type) ? sp.type : null;
  const onlyUnread = sp.unread === "1";

  if (session.status !== "ok") {
    return (
      <div className="space-y-6">
        <PageHeader title="Уведомления" />
        <NoRoleState className="bg-card" />
      </div>
    );
  }

  const { items, unread, failed } = await loadNotifications(300);
  const filtered = items.filter((i) => (!type || i.type === type) && (!onlyUnread || !i.read));
  const present = new Set(items.map((i) => i.type));
  const href = (t: string | null, u: boolean) => {
    const q = new URLSearchParams();
    if (t) q.set("type", t);
    if (u) q.set("unread", "1");
    const s = q.toString();
    return s ? `/notifications?${s}` : "/notifications";
  };
  const chip = (active: boolean) =>
    cn("inline-flex h-10 items-center rounded-full border px-3.5 text-sm whitespace-nowrap", active ? "border-brand bg-brand-soft text-brand" : "bg-card text-muted-foreground hover:text-foreground");

  return (
    <div className="space-y-6">
      <PageHeader title="Уведомления" description={unread > 0 ? `Непрочитанных: ${unread}` : "Все прочитано"} />
      <nav aria-label="Фильтр уведомлений" className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 sm:mx-0 sm:flex-wrap sm:px-0" data-testid="notification-filters">
        <Link href={href(null, onlyUnread)} className={chip(!type)}>Все типы</Link>
        {NOTIFICATION_TYPES.filter((t) => present.has(t) || t === type).map((t) => (
          <Link key={t} href={href(t, onlyUnread)} className={chip(type === t)}>{NOTIFICATION_TYPE_LABELS[t]}</Link>
        ))}
        <Link href={href(type, !onlyUnread)} className={cn(chip(onlyUnread), "sm:ml-auto")}>Только непрочитанные</Link>
      </nav>
      {failed ? (
        <ErrorState className="bg-card" title="Не удалось загрузить уведомления" />
      ) : filtered.length === 0 ? (
        <EmptyState className="bg-card" icon={Bell} title="Уведомлений нет" description="Здесь появятся заявки, сроки и задачи, требующие внимания." />
      ) : (
        <NotificationsList items={filtered} unreadTotal={unread} />
      )}
    </div>
  );
}
