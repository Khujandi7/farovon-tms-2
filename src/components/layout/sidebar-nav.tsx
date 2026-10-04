"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { NAV_ITEMS, isActivePath } from "@/lib/navigation";
import type { SectionId } from "@/lib/auth/roles";
import { cn } from "@/lib/utils";

/** Ссылки разделов. Получает только разрешённые разделы (видимость считает сервер). */
export function SidebarNav({ sections, onNavigate }: { sections: SectionId[]; onNavigate?: () => void }) {
  const pathname = usePathname();
  const items = NAV_ITEMS.filter((i) => sections.includes(i.id));

  return (
    <nav aria-label="Основная навигация" className="flex flex-col gap-0.5">
      {items.map((item) => {
        const active = isActivePath(pathname, item.href);
        const Icon = item.icon;
        return (
          <Link
            key={item.id}
            href={item.href}
            onClick={onNavigate}
            aria-current={active ? "page" : undefined}
            className={cn(
              "group flex items-center gap-3 rounded-md px-2.5 py-2 text-sm font-medium transition-colors",
              "outline-none focus-visible:ring-2 focus-visible:ring-ring/40",
              active
                ? "bg-brand-soft text-brand"
                : "text-sidebar-foreground hover:bg-accent hover:text-accent-foreground",
            )}
          >
            <Icon className={cn("size-4 shrink-0", active ? "text-brand" : "text-muted-foreground group-hover:text-foreground")} aria-hidden="true" />
            <span className="truncate">{item.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
