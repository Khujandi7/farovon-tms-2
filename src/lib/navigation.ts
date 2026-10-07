import type { LucideIcon } from "lucide-react";
import {
  BarChart3,
  ClipboardCheck,
  Award,
  FileUp,
  GraduationCap,
  HandCoins,
  LayoutDashboard,
  MessageSquareText,
  Settings,
  Users,
  Wallet,
} from "lucide-react";
import { type AppRole, type SectionId, canAccessSection } from "@/lib/auth/roles";

export type NavItem = { id: SectionId; href: `/${string}`; label: string; icon: LucideIcon; description: string };

/** Единый список разделов. Подписи меняются здесь. */
export const NAV_ITEMS: readonly NavItem[] = [
  { id: "dashboard", href: "/dashboard", label: "Дашборд", icon: LayoutDashboard, description: "Ключевые показатели года" },
  { id: "trainings", href: "/trainings", label: "Обучения", icon: GraduationCap, description: "Тренинги, сессии, участники" },
  { id: "employees", href: "/employees", label: "Сотрудники", icon: Users, description: "Справочник и досье обучения" },
  { id: "exams", href: "/exams", label: "Экзамены", icon: Award, description: "Экзамены, попытки, сертификаты" },
  { id: "funding", href: "/funding", label: "Финансирование", icon: HandCoins, description: "Политики, соглашения, обязательства" },
  { id: "imports", href: "/imports", label: "Импорт", icon: FileUp, description: "Загрузка данных из Excel и CSV" },
  { id: "budget", href: "/budget", label: "Бюджет", icon: Wallet, description: "План, версии, расходы" },
  { id: "feedback", href: "/feedback", label: "Обратная связь", icon: MessageSquareText, description: "Оценки после тренингов" },
  { id: "reports", href: "/reports", label: "Отчёты", icon: BarChart3, description: "Отчёты и выгрузки" },
  { id: "data-quality", href: "/data-quality", label: "Качество данных", icon: ClipboardCheck, description: "Проверки и замечания" },
  { id: "settings", href: "/settings", label: "Настройки", icon: Settings, description: "Профиль и параметры" },
];

export function navItemsForRole(role: AppRole | null | undefined): NavItem[] {
  return NAV_ITEMS.filter((item) => canAccessSection(role, item.id));
}

export function navItemById(id: SectionId): NavItem {
  const item = NAV_ITEMS.find((i) => i.id === id);
  if (!item) throw new Error(`Неизвестный раздел: ${id}`);
  return item;
}

export function isActivePath(pathname: string, href: string): boolean {
  return pathname === href || pathname.startsWith(`${href}/`);
}
