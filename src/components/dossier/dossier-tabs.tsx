"use client";

import Link from "next/link";
import { cn } from "@/lib/utils";

/** Навигация по вкладкам досье: обычные ссылки (?tab=…), каждая вкладка грузит только свои данные на сервере. */
export function DossierTabs({ employeeId, active, tabs }: { employeeId: string; active: string; tabs: readonly { id: string; label: string }[] }) {
  return (
    <nav aria-label="Разделы досье" className="-mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0" data-testid="dossier-tabs">
      <ul className="flex min-w-max gap-1 border-b">
        {tabs.map((t) => (
          <li key={t.id}>
            <Link
              href={`/employees/${employeeId}?tab=${t.id}`}
              scroll={false}
              aria-current={t.id === active ? "page" : undefined}
              data-testid={`tab-${t.id}`}
              className={cn(
                "inline-flex min-h-10 items-center whitespace-nowrap border-b-2 px-3 text-sm font-medium outline-none focus-visible:ring-2 focus-visible:ring-ring/40",
                t.id === active ? "border-brand text-foreground" : "border-transparent text-muted-foreground hover:text-foreground",
              )}
            >
              {t.label}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
