"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AlertTriangle, ArrowDown, ArrowUp, ArrowUpDown } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { BulkBar } from "./bulk-bar";
import type { OrgOption } from "./new-employee-dialog";

export type EmployeeRow = {
  id: string;
  employee_code: string | null;
  canonical_id: string;
  full_name: string;
  position: string | null;
  department: string | null;
  unit: string | null;
  is_active: boolean;
  events: number;
  hours: number;
  hasRemarks: boolean;
};

export type SortHeader = { key: "name" | "code" | "position" | "status"; label: string; href: string; dir: "asc" | "desc" | null };

const fmtHours = (h: number) => (Number.isInteger(h) ? String(h) : h.toFixed(1).replace(".", ","));

/** Таблица сотрудников (на телефоне — карточки) с мультивыбором и панелью массовых действий. Сортировка и страницы — ссылки на сервер. */
export function EmployeesTable({ rows, headers, orgUnits, canEdit }: { rows: EmployeeRow[]; headers: SortHeader[]; orgUnits: OrgOption[]; canEdit: boolean }) {
  const router = useRouter();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const allOn = rows.length > 0 && rows.every((r) => selected.has(r.id));
  const toggle = (id: string) =>
    setSelected((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  const toggleAll = () => setSelected(allOn ? new Set() : new Set(rows.map((r) => r.id)));
  const h = (k: SortHeader["key"]) => headers.find((x) => x.key === k)!;
  const sortLink = (k: SortHeader["key"]) => {
    const x = h(k);
    const Icon = x.dir === "asc" ? ArrowUp : x.dir === "desc" ? ArrowDown : ArrowUpDown;
    return (
      <Link href={x.href} className="inline-flex items-center gap-1 hover:text-foreground" aria-label={`Сортировать: ${x.label}`}>
        {x.label}
        <Icon className="size-3" aria-hidden="true" />
      </Link>
    );
  };
  const ariaSort = (k: SortHeader["key"]) => (h(k).dir === "asc" ? "ascending" : h(k).dir === "desc" ? "descending" : "none");
  const statusBadge = (r: EmployeeRow) => (r.is_active ? <Badge variant="success">Активен</Badge> : <Badge variant="outline">Неактивен</Badge>);
  const remarksBadge = (r: EmployeeRow) =>
    r.hasRemarks ? (
      <Badge variant="warning" title="Есть незавершённые замечания к данным" data-testid="employee-remarks">
        <AlertTriangle aria-hidden="true" /> Замечания
      </Badge>
    ) : null;

  return (
    <div className="space-y-3">
      {/* Планшет и компьютер */}
      <div className="hidden rounded-xl border bg-card shadow-xs md:block">
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              {canEdit && (
                <TableHead className="w-10">
                  <input type="checkbox" checked={allOn} onChange={toggleAll} aria-label="Выбрать всех на странице" className="size-4 accent-[var(--brand)]" data-testid="select-all" />
                </TableHead>
              )}
              <TableHead aria-sort={ariaSort("name")}>{sortLink("name")}</TableHead>
              <TableHead aria-sort={ariaSort("code")}>{sortLink("code")}</TableHead>
              <TableHead aria-sort={ariaSort("position")}>{sortLink("position")}</TableHead>
              <TableHead>Подразделение</TableHead>
              <TableHead aria-sort={ariaSort("status")}>{sortLink("status")}</TableHead>
              <TableHead className="text-right">Мероприятий / часов</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((e) => (
              <TableRow key={e.id} data-testid="employee-row" data-state={selected.has(e.id) ? "selected" : undefined} className={selected.has(e.id) ? "bg-muted/50" : undefined}>
                {canEdit && (
                  <TableCell>
                    <input type="checkbox" checked={selected.has(e.id)} onChange={() => toggle(e.id)} aria-label={`Выбрать: ${e.full_name}`} className="size-4 accent-[var(--brand)]" data-testid="select-row" />
                  </TableCell>
                )}
                <TableCell className="font-medium">
                  <Link href={`/employees/${e.id}`} className="hover:text-brand hover:underline">{e.full_name}</Link>
                  <span className="ml-2">{remarksBadge(e)}</span>
                </TableCell>
                <TableCell className="font-mono text-xs text-muted-foreground">{e.employee_code ?? e.canonical_id}</TableCell>
                <TableCell>{e.position ?? "—"}</TableCell>
                <TableCell>
                  {e.department ?? "—"}
                  {e.unit && <span className="text-muted-foreground"> / {e.unit}</span>}
                </TableCell>
                <TableCell>{statusBadge(e)}</TableCell>
                <TableCell className="text-right tabular-nums">{e.events} / {fmtHours(e.hours)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      {/* Телефон: карточки */}
      <ul className="grid gap-2 md:hidden" aria-label="Сотрудники">
        {canEdit && (
          <li>
            <label className="flex min-h-10 items-center gap-2 text-sm">
              <input type="checkbox" checked={allOn} onChange={toggleAll} className="size-5 accent-[var(--brand)]" /> Выбрать всех на странице
            </label>
          </li>
        )}
        {rows.map((e) => (
          <li key={e.id} data-testid="employee-card" className={`rounded-xl border bg-card p-3 shadow-xs ${selected.has(e.id) ? "ring-2 ring-[var(--brand)]" : ""}`}>
            <div className="flex items-start gap-3">
              {canEdit && (
                <input type="checkbox" checked={selected.has(e.id)} onChange={() => toggle(e.id)} aria-label={`Выбрать: ${e.full_name}`} className="mt-1 size-5 shrink-0 accent-[var(--brand)]" />
              )}
              <div className="min-w-0 flex-1 space-y-1">
                <Link href={`/employees/${e.id}`} className="block min-h-6 font-medium hover:text-brand hover:underline">{e.full_name}</Link>
                <p className="text-xs text-muted-foreground">
                  <span className="font-mono">{e.employee_code ?? e.canonical_id}</span> · {e.position ?? "должность не указана"}
                </p>
                <p className="text-sm">{[e.department, e.unit].filter(Boolean).join(" / ") || "—"}</p>
                <div className="flex flex-wrap items-center gap-2 pt-1">
                  {statusBadge(e)}
                  {remarksBadge(e)}
                  <span className="ml-auto text-xs text-muted-foreground tabular-nums">{e.events} мер. / {fmtHours(e.hours)} ч</span>
                </div>
              </div>
            </div>
          </li>
        ))}
      </ul>

      {canEdit && selected.size > 0 && (
        <BulkBar
          ids={[...selected]}
          orgUnits={orgUnits}
          onClear={() => setSelected(new Set())}
          onDone={() => {
            setSelected(new Set());
            router.refresh();
          }}
        />
      )}
    </div>
  );
}
