import { Suspense } from "react";
import { NotificationBellMenu } from "@/components/notifications/notification-bell-menu";
import { loadNotifications } from "@/lib/portal/notifications-server";

async function BellData() {
  const { items, unread } = await loadNotifications(8);
  return <NotificationBellMenu items={items} unread={unread} />;
}

/** Колокольчик в шапке: серверный компонент (данные и пересчёт на сервере), меню — клиентское. */
export function NotificationBell() {
  return (
    <Suspense fallback={<NotificationBellMenu items={[]} unread={0} />}>
      <BellData />
    </Suspense>
  );
}
