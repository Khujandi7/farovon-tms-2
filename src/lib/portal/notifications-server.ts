import "server-only";
import { createClient } from "@/lib/supabase/server";

export type NotificationItem = {
  id: string;
  type: string;
  severity: string;
  title: string;
  body: string | null;
  href: string | null;
  created_at: string;
  read: boolean;
};

/**
 * Пересчёт (notify_scan, БД сама пропускает вызовы чаще раза в минуту) и чтение уведомлений текущего пользователя.
 * RLS оставляет только открытые уведомления, предназначенные роли пользователя. Любая ошибка = пустой список (шапка не должна падать).
 */
export async function loadNotifications(limit = 100, scan = true): Promise<{ items: NotificationItem[]; unread: number; failed: boolean }> {
  try {
    const supabase = await createClient();
    if (scan) await supabase.rpc("notify_scan");
    const [n, r] = await Promise.all([
      supabase.from("notifications").select("id, type, severity, title, body, href, created_at").is("resolved_at", null).order("created_at", { ascending: false }).limit(limit),
      supabase.from("notification_reads").select("notification_id").limit(5000),
    ]);
    if (n.error) return { items: [], unread: 0, failed: true };
    const read = new Set((r.data ?? []).map((x) => x.notification_id));
    const items = (n.data ?? []).map((x) => ({ ...x, read: read.has(x.id) }));
    return { items, unread: items.filter((i) => !i.read).length, failed: false };
  } catch {
    return { items: [], unread: 0, failed: true };
  }
}
