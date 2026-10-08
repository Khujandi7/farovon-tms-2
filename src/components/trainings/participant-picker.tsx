"use client";

import { useMemo, useState } from "react";
import { Search, UserMinus, Users, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { addToSelection, filterEmployees, orgLabel, removeFromSelection, type PickEmployee, type PickUnit } from "@/lib/trainings/participant-filter";

const SHOW = 100;

/**
 * Выбор участников из справочника сотрудников при создании обучения: поиск, фильтры по департаменту и отделу,
 * «Выбрать всех найденных», снятие отдельных сотрудников. Создать сотрудника здесь нельзя — только выбрать существующего.
 */
export function ParticipantPicker({ employees, units, value, onChange, disabled, planned }: { employees: PickEmployee[]; units: PickUnit[]; value: string[]; onChange: (ids: string[]) => void; disabled?: boolean; planned?: number | null }) {
  const [q, setQ] = useState("");
  const [dept, setDept] = useState("");
  const [unit, setUnit] = useState("");
  const unitMap = useMemo(() => new Map(units.map((u) => [u.id, u])), [units]);
  const departments = useMemo(() => units.filter((u) => u.level === "DEPARTMENT").sort((a, b) => a.name.localeCompare(b.name, "ru")), [units]);
  const sections = useMemo(() => units.filter((u) => u.level === "UNIT" && (!dept || u.parent_id === Number(dept))).sort((a, b) => a.name.localeCompare(b.name, "ru")), [units, dept]);
  const found = useMemo(() => filterEmployees(employees, units, { q, departmentId: dept ? Number(dept) : null, unitId: unit ? Number(unit) : null }), [employees, units, q, dept, unit]);
  const selected = useMemo(() => new Set(value), [value]);
  const byId = useMemo(() => new Map(employees.map((e) => [e.id, e])), [employees]);
  const foundNotSelected = found.filter((e) => !selected.has(e.id)).length;
  const filtered = !!(q.trim() || dept || unit);

  return (
    <section className="min-w-0 space-y-4" aria-labelledby="participants-title" data-testid="participant-picker">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h2 id="participants-title" className="font-medium">Участники</h2>
          <p className="text-sm text-muted-foreground">Выберите сотрудников из справочника. План ({planned ?? "—"}) остаётся контрольной цифрой, факт — выбранные сотрудники.</p>
        </div>
        <Badge variant={value.length ? "brand" : "outline"} data-testid="picker-count">Выбрано: {value.length} {plural(value.length)}</Badge>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-[1fr_12rem_12rem]">
        <div className="grid gap-1.5">
          <Label htmlFor="picker-q">Поиск</Label>
          <div className="relative">
            <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
            <Input id="picker-q" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Фамилия, имя или табельный номер" className="pl-8" autoComplete="off" disabled={disabled} data-testid="picker-search" />
          </div>
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="picker-dept">Департамент</Label>
          <Select id="picker-dept" value={dept} onChange={(e) => { setDept(e.target.value); setUnit(""); }} disabled={disabled} data-testid="picker-dept">
            <option value="">Все</option>
            {departments.map((d) => (<option key={d.id} value={d.id}>{d.name}</option>))}
          </Select>
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="picker-unit">Отдел / секция</Label>
          <Select id="picker-unit" value={unit} onChange={(e) => setUnit(e.target.value)} disabled={disabled || sections.length === 0} data-testid="picker-unit">
            <option value="">Все</option>
            {sections.map((u) => (<option key={u.id} value={u.id}>{u.name}</option>))}
          </Select>
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        <Button type="button" size="sm" variant="outline" onClick={() => onChange(addToSelection(value, found.map((e) => e.id)))} disabled={disabled || foundNotSelected === 0} data-testid="picker-select-all">
          <Users aria-hidden="true" /> Выбрать всех найденных{filtered ? ` (${found.length})` : ""}
        </Button>
        <Button type="button" size="sm" variant="ghost" onClick={() => onChange([])} disabled={disabled || value.length === 0} data-testid="picker-clear">
          <X aria-hidden="true" /> Снять выбор
        </Button>
      </div>

      {employees.length === 0 ? (
        <p className="rounded-lg border p-3 text-sm text-muted-foreground">В справочнике нет активных сотрудников. Импортируйте их: Сотрудники → Импорт (Excel, CSV или Google Sheets).</p>
      ) : (
        <div className="rounded-lg border">
          <p className="border-b px-3 py-2 text-xs text-muted-foreground" data-testid="picker-found">Найдено: {found.length}{found.length > SHOW ? `, показаны первые ${SHOW} — уточните поиск` : ""}</p>
          <ul className="max-h-72 divide-y overflow-y-auto" aria-label="Сотрудники">
            {found.slice(0, SHOW).map((e) => {
              const on = selected.has(e.id);
              return (
                <li key={e.id}>
                  <label className="flex cursor-pointer items-start gap-3 px-3 py-2 text-sm hover:bg-accent/50" data-testid="picker-row">
                    <input type="checkbox" className="mt-0.5 size-4 shrink-0 accent-brand" checked={on} disabled={disabled} onChange={() => onChange(on ? removeFromSelection(value, [e.id]) : addToSelection(value, [e.id]))} aria-label={e.full_name} />
                    <span className="min-w-0">
                      <span className="block font-medium">{e.full_name}{e.employee_code && <span className="ml-2 font-mono text-xs font-normal text-muted-foreground">{e.employee_code}</span>}</span>
                      <span className="block truncate text-xs text-muted-foreground">{[orgLabel(e, unitMap), e.position].filter(Boolean).join(" · ") || "Подразделение не указано"}</span>
                    </span>
                  </label>
                </li>
              );
            })}
            {found.length === 0 && <li className="px-3 py-6 text-center text-sm text-muted-foreground">Никого не найдено</li>}
          </ul>
        </div>
      )}

      {value.length > 0 && (
        <div className="space-y-2" data-testid="picker-selected">
          <p className="text-sm font-medium">Выбранные</p>
          <ul className="flex flex-wrap gap-1.5">
            {value.slice(0, 60).map((id) => {
              const e = byId.get(id);
              return (
                <li key={id} className="inline-flex max-w-full items-center gap-1 rounded-full border bg-card py-0.5 pr-1 pl-2.5 text-xs" data-testid="picker-chip">
                  <span className="truncate">{e?.full_name ?? id}</span>
                  <button type="button" className="rounded-full p-0.5 text-muted-foreground hover:bg-accent hover:text-foreground" onClick={() => onChange(removeFromSelection(value, [id]))} disabled={disabled} aria-label={`Убрать ${e?.full_name ?? ""}`}>
                    <UserMinus className="size-3.5" aria-hidden="true" />
                  </button>
                </li>
              );
            })}
            {value.length > 60 && <li className="px-2 py-0.5 text-xs text-muted-foreground">…и ещё {value.length - 60}</li>}
          </ul>
        </div>
      )}
    </section>
  );
}

function plural(n: number) {
  const m10 = n % 10, m100 = n % 100;
  if (m10 === 1 && m100 !== 11) return "сотрудник";
  if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return "сотрудника";
  return "сотрудников";
}
