export type LinkStatus = "ACTIVE" | "DISABLED" | "REPLACED" | "EXPIRED";

export const LINK_STATUS_LABELS: Record<LinkStatus, string> = {
  ACTIVE: "Активна",
  DISABLED: "Отключена",
  REPLACED: "Заменена новой",
  EXPIRED: "Срок истёк",
};

export function linkStatus(l: { is_active: boolean; replaced_by: string | null; expires_at: string | null }, now: Date = new Date()): LinkStatus {
  if (l.replaced_by) return "REPLACED";
  if (!l.is_active) return "DISABLED";
  if (l.expires_at && new Date(l.expires_at).getTime() < now.getTime()) return "EXPIRED";
  return "ACTIVE";
}
