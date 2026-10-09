"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Search } from "lucide-react";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { useToast } from "@/components/workflow/toast";
import { reanalyzeImportRow, resolveImportRow, searchEmployeesForImport, type EmployeeHit } from "@/app/(app)/imports/actions";
import { addOrgUnitAlias, createOrgUnitsBulk } from "@/app/(app)/settings/references/actions";
import { parseUnitIssues, type UnitIssue } from "@/lib/imports/unit-issues";
import { ROW_STATUS_LABELS, type ImportEntity } from "@/lib/imports/entities";
import type { JobRowView } from "@/lib/imports/types";

export type OrgUnitOption = { id: number; name: string; parent_id: number | null; level: "DEPARTMENT" | "UNIT" };

const MATCH_KIND: Record<string, string> = { CODE: "по табельному №", EXACT: "точное ФИО", ALIAS: "по написанию", REORDERED: "другой порядок слов", PARTIAL: "частичное" };
const variant = (s: string) => (s === "ERROR" ? "warning" : s === "NEEDS_REVIEW" ? "warning" : s === "NEW" || s === "UPDATED" ? "success" : "outline") as "warning" | "success" | "outline";

/** Что означает «Применить» для спорной строки; null — применять без сопоставления нельзя. */
export function applyLabel(entity: ImportEntity, code: string | null): string | null {
  if (code === "SKILL_UNKNOWN") return "Создать квалификацию и применить";
  if (code === "TYPE_UNKNOWN") return "Применить с типом «Тренинг»";
  if (code === "UNIT_UNKNOWN") return "Применить без подразделения";
  if (entity === "EMPLOYEES" && (code === "EMPLOYEE_FUZZY" || code === "EMPLOYEE_AMBIGUOUS" || code === "EMPLOYEE_NOT_FOUND")) return "Создать нового сотрудника";
  return null;
}

/**
 * Разрешение «Подразделение не найдено» на месте: создать подразделение (или отдел в департаменте) либо сопоставить написание
 * с существующим подразделением (псевдоним). Автоматически ничего не объединяется — выбор делает человек. После действия строка
 * проверяется повторно: если названия разрешились, она возвращается в обычный статус, замечание Data Quality закрывается.
 */
function UnitResolver({ jobId, row, issues, units, canEdit }: { jobId: string; row: JobRowView; issues: UnitIssue[]; units: OrgUnitOption[]; canEdit: boolean }) {
  const router = useRouter();
  const { notify } = useToast();
  const [pending, start] = useTransition();
  const departments = units.filter((u) => u.level === "DEPARTMENT");
  const first = issues[0]!;
  const rowDept = row.dept_id ? String(row.dept_id) : "";
  const [target, setTarget] = useState("");
  const [parent, setParent] = useState(rowDept);
  const candidates = units.filter((u) => u.level === first.kind);

  function after(r: { ok: boolean; message?: string; error?: string }, label?: string) {
    notify(r.ok, r.ok ? (label ?? r.message ?? "Готово.") : (r.error ?? "Ошибка."));
  }
  function run(action: () => Promise<{ ok: true; message?: string } | { ok: false; error: string }>) {
    start(async () => {
      const done = await action();
      if (!done.ok) { after(done); return; }
      const re = await reanalyzeImportRow({ jobId, rowId: row.id });
      after(re.ok ? { ok: true, message: re.message } : re);
      router.refresh();
    });
  }
  const reason = `Из импорта, строка ${row.row_no}`;

  return (
    <div className="space-y-2 rounded-lg bg-muted/40 p-2 text-sm" data-testid="import-unit-resolver">
      <p className="font-medium">{first.kind === "DEPARTMENT" ? "Подразделение" : "Отдел"} «{first.name}» не найдено в справочнике</p>
      {canEdit ? (
        <div className="grid gap-2 sm:grid-cols-2">
          <div className="space-y-1.5">
            <p className="text-xs text-muted-foreground">Создать новое</p>
            {first.kind === "UNIT" && (
              <Select aria-label="Департамент для нового отдела" value={parent} onChange={(e) => setParent(e.target.value)} disabled={pending}>
                <option value="">— департамент —</option>
                {departments.map((d) => (<option key={d.id} value={d.id}>{d.name}</option>))}
              </Select>
            )}
            <Button type="button" size="sm" variant="outline" className="min-h-10" disabled={pending || (first.kind === "UNIT" && !parent)} data-testid="import-unit-create"
              onClick={() => run(async () => {
                // явный клик «Создать» — подтверждение пользователя; bulk-RPC идемпотентен (повтор не создаёт дубль) и не угадывает неоднозначное
                const parentName = first.kind === "UNIT" ? departments.find((d) => String(d.id) === parent)?.name ?? null : null;
                const r = await createOrgUnitsBulk({ rows: [{ name: first.name, parent: parentName }], reason, confirmed: true });
                if (!r.ok) return r;
                if (r.data.errors.length > 0) return { ok: false as const, error: r.data.errors[0]!.error };
                return { ok: true as const, message: r.message };
              })}>
              Создать «{first.name}»
            </Button>
          </div>
          <div className="space-y-1.5">
            <p className="text-xs text-muted-foreground">Это другое написание существующего</p>
            <Select aria-label="Существующее подразделение" value={target} onChange={(e) => setTarget(e.target.value)} disabled={pending}>
              <option value="">— выберите —</option>
              {candidates.map((u) => (<option key={u.id} value={u.id}>{u.name}</option>))}
            </Select>
            <Button type="button" size="sm" variant="outline" className="min-h-10" disabled={pending || !target} data-testid="import-unit-map"
              onClick={() => run(() => addOrgUnitAlias({ id: target, alias: first.name, reason }))}>
              Закрепить написание
            </Button>
          </div>
        </div>
      ) : (
        <p className="text-muted-foreground">Создавать и сопоставлять подразделения могут администратор, менеджер академии и HR.</p>
      )}
      <div className="flex flex-wrap items-center gap-2">
        <Button type="button" size="sm" variant="ghost" className="min-h-10" disabled={pending} data-testid="import-unit-recheck" onClick={() => start(async () => { const re = await reanalyzeImportRow({ jobId, rowId: row.id }); after(re.ok ? { ok: true, message: re.message } : re); router.refresh(); })}>
          Проверить снова
        </Button>
        <Button asChild size="sm" variant="ghost" className="min-h-10"><Link href={`/settings/references?q=${encodeURIComponent(first.name)}#units`}>Открыть справочник подразделений</Link></Button>
        {pending && <Loader2 className="size-4 animate-spin text-muted-foreground" aria-label="Сохранение" />}
      </div>
    </div>
  );
}

export function ImportRowCard({ jobId, entity, row, canDecide, units = [], canEditUnits = false }: { jobId: string; entity: ImportEntity; row: JobRowView; canDecide: boolean; units?: OrgUnitOption[]; canEditUnits?: boolean }) {
  const router = useRouter();
  const { notify } = useToast();
  const [pending, start] = useTransition();
  const [search, setSearch] = useState(false);
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<EmployeeHit[] | null>(null);
  const review = row.status === "NEEDS_REVIEW";
  const apply = applyLabel(entity, row.review_code);
  const unitIssues = review && row.review_code === "UNIT_UNKNOWN" ? parseUnitIssues(row.messages) : [];
  const entries = Object.entries(row.data).filter(([, v]) => v !== "" && v != null).slice(0, 8);

  function decide(decision: "APPLY" | "SKIP" | "MATCH", match?: string) {
    start(async () => {
      const r = await resolveImportRow({ jobId, rowId: row.id, decision, match: match ?? null });
      notify(r.ok, r.ok ? (r.message ?? "Готово.") : r.error);
      if (r.ok) router.refresh();
    });
  }
  function find() {
    start(async () => {
      const r = await searchEmployeesForImport(q);
      if (r.ok) setHits(r.data);
      else notify(false, r.error);
    });
  }

  const decisionText = row.decision === "SKIP" ? "Решение: пропустить" : row.decision === "APPLY" ? "Решение: применить" : row.decision === "MATCH" ? "Решение: сопоставлено" : null;

  return (
    <li className="space-y-2 rounded-xl border bg-card p-3 shadow-xs sm:p-4" data-testid="import-row" data-status={row.status}>
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs text-muted-foreground tabular-nums">Строка {row.row_no}</span>
        <Badge variant={variant(row.status)}>{ROW_STATUS_LABELS[row.status] ?? row.status}</Badge>
        {decisionText && <Badge variant="brand">{decisionText}</Badge>}
      </div>
      <dl className="grid gap-x-4 gap-y-1 text-sm sm:grid-cols-2 lg:grid-cols-4">
        {entries.map(([k, v]) => (
          <div key={k} className="min-w-0">
            <dt className="truncate text-xs text-muted-foreground">{k}</dt>
            <dd className="truncate" title={String(v)}>{String(v)}</dd>
          </div>
        ))}
      </dl>
      {row.messages.length > 0 && (
        <ul className="list-disc space-y-0.5 pl-5 text-sm text-muted-foreground">
          {row.messages.map((m, i) => (<li key={i}>{m}</li>))}
        </ul>
      )}
      {review && canDecide && (
        <div className="space-y-2 border-t pt-2" data-testid="import-row-resolve">
          {unitIssues.length > 0 && <UnitResolver jobId={jobId} row={row} issues={unitIssues} units={units} canEdit={canEditUnits} />}
          {row.candidates.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {row.candidates.slice(0, 5).map((c) => (
                <Button key={c.employee_id} type="button" size="sm" variant={row.decision === "MATCH" && row.decision_match === c.employee_id ? "default" : "outline"} disabled={pending} onClick={() => decide("MATCH", c.employee_id)} className="h-auto min-h-10 whitespace-normal py-1.5 text-left" data-testid="import-match">
                  Сопоставить с: {c.full_name}
                  <span className="text-xs font-normal opacity-70"> ({MATCH_KIND[c.match_kind] ?? c.match_kind}{c.position ? `, ${c.position}` : ""}{c.is_active ? "" : ", неактивен"})</span>
                </Button>
              ))}
            </div>
          )}
          <div className="flex flex-wrap gap-2">
            <Button type="button" size="sm" variant="outline" className="min-h-10" onClick={() => setSearch((s) => !s)} aria-expanded={search}><Search aria-hidden="true" /> Найти сотрудника</Button>
            {apply && <Button type="button" size="sm" variant="outline" className="min-h-10" disabled={pending} onClick={() => decide("APPLY")} data-testid="import-apply-row">{apply}</Button>}
            <Button type="button" size="sm" variant={row.decision === "SKIP" ? "default" : "outline"} className="min-h-10" disabled={pending} onClick={() => decide("SKIP")} data-testid="import-skip">Пропустить</Button>
            {pending && <Loader2 className="size-4 animate-spin self-center text-muted-foreground" aria-label="Сохранение" />}
          </div>
          {search && (
            <div className="space-y-2 rounded-lg bg-muted/40 p-2">
              <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); find(); }}>
                <Input aria-label="Поиск сотрудника по ФИО" placeholder="Фамилия или имя" value={q} onChange={(e) => setQ(e.target.value)} className="min-h-10" />
                <Button type="submit" size="sm" className="min-h-10" disabled={pending || q.trim().length < 2}>Найти</Button>
              </form>
              {hits && hits.length === 0 && <p className="text-sm text-muted-foreground">Никого не найдено.</p>}
              {hits && hits.length > 0 && (
                <ul className="space-y-1">
                  {hits.map((h) => (
                    <li key={h.id}>
                      <Button type="button" variant="ghost" size="sm" className="h-auto min-h-10 w-full justify-start whitespace-normal py-1.5 text-left" disabled={pending} onClick={() => decide("MATCH", h.id)}>
                        {h.full_name}<span className="text-xs font-normal text-muted-foreground"> {h.position ?? ""}{h.is_active ? "" : " · неактивен"}</span>
                      </Button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </div>
      )}
    </li>
  );
}
