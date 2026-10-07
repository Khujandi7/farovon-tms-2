"use client";

import { useState } from "react";
import Link from "next/link";
import { Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import type { OrgOption } from "./new-employee-dialog";

export type FilterValues = { q: string; dept: number | null; unit: number | null; status: "active" | "inactive" | "all"; remarks: boolean; sort: string; dir: string };

/** Фильтры списка сотрудников: обычная GET-форма, состояние живёт в URL (страница считает всё на сервере). */
export function EmployeeFilters({ orgUnits, values, showRemarks }: { orgUnits: OrgOption[]; values: FilterValues; showRemarks: boolean }) {
  const [dept, setDept] = useState(values.dept ? String(values.dept) : "");
  const departments = orgUnits.filter((u) => u.level === "DEPARTMENT");
  const units = orgUnits.filter((u) => u.level === "UNIT" && (!dept || String(u.parent_id) === dept));
  const dirty = values.q || values.dept || values.unit || values.status !== "active" || values.remarks;

  return (
    <form method="get" action="/employees" role="search" aria-label="Фильтры сотрудников" className="grid gap-3 sm:grid-cols-2 lg:flex lg:flex-wrap lg:items-end" data-testid="employee-filters">
      <input type="hidden" name="sort" value={values.sort} />
      <input type="hidden" name="dir" value={values.dir} />
      <label className="grid gap-1 text-xs text-muted-foreground sm:col-span-2 lg:col-span-1">
        Поиск по ФИО или табельному номеру
        <span className="relative">
          <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2" aria-hidden="true" />
          <Input name="q" defaultValue={values.q} placeholder="Фамилия или номер" className="min-h-10 min-w-64 pl-8" data-testid="employee-search" />
        </span>
      </label>
      <label className="grid gap-1 text-xs text-muted-foreground">
        Департамент
        <Select name="dept" value={dept} onChange={(e) => setDept(e.target.value)} className="min-w-48" data-testid="filter-dept">
          <option value="">Все</option>
          {departments.map((d) => (
            <option key={d.id} value={d.id}>{d.name}</option>
          ))}
        </Select>
      </label>
      <label className="grid gap-1 text-xs text-muted-foreground">
        Отдел
        <Select name="unit" defaultValue={values.unit ? String(values.unit) : ""} key={dept} className="min-w-48" data-testid="filter-unit">
          <option value="">Все</option>
          {units.map((u) => (
            <option key={u.id} value={u.id}>{u.name}</option>
          ))}
        </Select>
      </label>
      <label className="grid gap-1 text-xs text-muted-foreground">
        Статус
        <Select name="status" defaultValue={values.status} className="min-w-36" data-testid="filter-status">
          <option value="active">Активные</option>
          <option value="inactive">Неактивные</option>
          <option value="all">Все</option>
        </Select>
      </label>
      {showRemarks && (
        <label className="flex min-h-10 items-center gap-2 text-sm">
          <input type="checkbox" name="remarks" value="1" defaultChecked={values.remarks} className="size-4 accent-[var(--brand)]" data-testid="filter-remarks" /> Есть незавершённые замечания
        </label>
      )}
      <div className="flex gap-2">
        <Button type="submit" variant="outline" className="min-h-10">Применить</Button>
        {dirty && <Button asChild variant="ghost" className="min-h-10"><Link href="/employees">Сбросить</Link></Button>}
      </div>
    </form>
  );
}
