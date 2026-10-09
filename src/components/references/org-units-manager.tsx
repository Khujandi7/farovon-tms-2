"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Building2, ListPlus, MoveRight, Pencil, Plus, Power, PowerOff, Search, Tag } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { FormAlert } from "@/components/auth/form-parts";
import { EmptyState } from "@/components/common/states";
import { ReasonDialog } from "@/components/workflow/reason-dialog";
import { useToast } from "@/components/workflow/toast";
import { addOrgUnitAlias, createOrgUnit, moveOrgUnit, renameOrgUnit, setOrgUnitActive } from "@/app/(app)/settings/references/actions";
import { OrgUnitsBulkDialog } from "@/components/references/org-units-bulk-dialog";
import { normUnitName, type ExistingAlias } from "@/lib/org/bulk";

export type OrgUnitRow = { id: number; name: string; parent_id: number | null; level: "DEPARTMENT" | "UNIT"; is_active: boolean; employees: number };

type Dialog = null | { kind: "rename" | "move" | "active" | "alias"; unit: OrgUnitRow };

/**
 * Справочник подразделений: департамент → отделы. Всё по id: переименование не ломает ссылки (прежнее название остаётся псевдонимом),
 * отдел можно переместить в другой департамент, подразделение деактивируется и восстанавливается (удаления нет).
 * Правила (например, «у департамента не должно быть действующих отделов») проверяет база, её сообщение показывается как есть.
 */
export function OrgUnitsManager({ units, canEdit, initialQuery = "", aliases = [] }: { units: OrgUnitRow[]; canEdit: boolean; initialQuery?: string; aliases?: ExistingAlias[] }) {
  const router = useRouter();
  const { notify } = useToast();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | undefined>();
  const [dialog, setDialog] = useState<Dialog>(null);
  const [name, setName] = useState("");
  const [target, setTarget] = useState("");
  const [newName, setNewName] = useState(initialQuery);
  const [query, setQuery] = useState(initialQuery);
  const [alias, setAlias] = useState("");
  const [bulkOpen, setBulkOpen] = useState(false);
  const [parent, setParent] = useState("");
  const [showInactive, setShowInactive] = useState(false);
  const departments = units.filter((u) => u.level === "DEPARTMENT");
  const activeDepartments = departments.filter((d) => d.is_active);
  const q = normUnitName(query);
  const match = (u: OrgUnitRow) => q === "" || normUnitName(u.name).includes(q);
  const childrenOf = (d: OrgUnitRow) => units.filter((u) => u.parent_id === d.id && (showInactive || u.is_active));
  // департамент виден, если подходит он сам или любой его отдел; при совпадении отдела показываются только подходящие отделы
  const visibleDepartments = (showInactive ? departments : departments.filter((d) => d.is_active)).filter((d) => match(d) || childrenOf(d).some(match));
  const shownChildren = (d: OrgUnitRow) => (q === "" || match(d) ? childrenOf(d) : childrenOf(d).filter(match));
  const inactiveCount = units.filter((u) => !u.is_active).length;

  function create() {
    setError(undefined);
    start(async () => {
      const r = await createOrgUnit({ name: newName, parentId: parent || null });
      if (r.ok) {
        notify(true, r.message ?? "Готово.");
        setNewName("");
        router.refresh();
      } else setError(r.error);
    });
  }
  function openDialog(kind: "rename" | "move" | "active" | "alias", unit: OrgUnitRow) {
    setName(unit.name);
    setAlias("");
    setTarget("");
    setDialog({ kind, unit });
  }

  function UnitLine({ u }: { u: OrgUnitRow }) {
    return (
      <>
        <span className={u.is_active ? "" : "text-muted-foreground line-through"}>{u.name}</span>
        <Badge variant="outline">{u.level === "DEPARTMENT" ? "Департамент" : "Отдел"}</Badge>
        {u.parent_id !== null && <span className="text-xs text-muted-foreground">в «{units.find((x) => x.id === u.parent_id)?.name ?? "—"}»</span>}
        <span className="text-xs text-muted-foreground">сотрудников: {u.employees}</span>
        {!u.is_active && <Badge variant="outline">Неактивно</Badge>}
        {canEdit && (
          <span className="ml-auto flex flex-wrap gap-1">
            <Button size="sm" variant="ghost" className="max-md:h-10" aria-label={`Написания ${u.name}`} onClick={() => openDialog("alias", u)} disabled={pending}><Tag aria-hidden="true" /> <span className="max-sm:sr-only">Написания</span></Button>
            <Button size="sm" variant="ghost" className="max-md:h-10" aria-label={`Переименовать ${u.name}`} onClick={() => openDialog("rename", u)} disabled={pending}><Pencil aria-hidden="true" /> <span className="max-sm:sr-only">Переименовать</span></Button>
            {u.level === "UNIT" && u.is_active && (
              <Button size="sm" variant="ghost" className="max-md:h-10" aria-label={`Переместить ${u.name}`} onClick={() => openDialog("move", u)} disabled={pending}><MoveRight aria-hidden="true" /> <span className="max-sm:sr-only">Переместить</span></Button>
            )}
            <Button size="sm" variant="ghost" className="max-md:h-10" aria-label={`${u.is_active ? "Деактивировать" : "Восстановить"} ${u.name}`} onClick={() => openDialog("active", u)} disabled={pending}>
              {u.is_active ? <PowerOff aria-hidden="true" /> : <Power aria-hidden="true" />} <span className="max-sm:sr-only">{u.is_active ? "Деактивировать" : "Восстановить"}</span>
            </Button>
          </span>
        )}
      </>
    );
  }

  const unit = dialog?.unit;
  return (
    <div className="space-y-4" data-testid="org-units">
      <FormAlert error={error} />
      {canEdit && (
        <form className="flex flex-wrap items-end gap-2 rounded-xl border bg-card p-3 shadow-xs" onSubmit={(e) => { e.preventDefault(); create(); }}>
          <div className="grid gap-1">
            <Label htmlFor="new-unit-name" className="text-xs">Название</Label>
            <Input id="new-unit-name" value={newName} onChange={(e) => setNewName(e.target.value)} disabled={pending} className="min-w-60" />
          </div>
          <div className="grid gap-1">
            <Label htmlFor="new-unit-parent" className="text-xs">Тип</Label>
            <Select id="new-unit-parent" value={parent} onChange={(e) => setParent(e.target.value)} disabled={pending} className="min-w-60">
              <option value="">Департамент</option>
              {activeDepartments.map((d) => (
                <option key={d.id} value={d.id}>Отдел в «{d.name}»</option>
              ))}
            </Select>
          </div>
          <Button type="submit" disabled={pending || newName.trim().length < 2}><Plus aria-hidden="true" /> Добавить</Button>
          <Button type="button" variant="outline" onClick={() => setBulkOpen(true)} disabled={pending} data-testid="org-bulk-open"><ListPlus aria-hidden="true" /> Добавить списком</Button>
        </form>
      )}
      <div className="relative max-w-md">
        <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
        <Input aria-label="Поиск подразделений" placeholder="Поиск по названию" value={query} onChange={(e) => setQuery(e.target.value)} className="pl-9" data-testid="org-search" />
      </div>
      {inactiveCount > 0 && (
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" className="size-4 accent-[var(--brand)]" checked={showInactive} onChange={(e) => setShowInactive(e.target.checked)} /> Показывать неактивные ({inactiveCount})
        </label>
      )}
      {visibleDepartments.length === 0 ? (
        <EmptyState className="bg-card" icon={Building2} title={q ? "Ничего не найдено" : "Подразделений пока нет"} description={q ? "Измените запрос или создайте подразделение выше." : "Добавьте департамент, затем его отделы."} />
      ) : (
        <ul className="space-y-3">
          {visibleDepartments.map((d) => (
            <li key={d.id} className="rounded-xl border bg-card shadow-xs" data-testid="department">
              <div className="flex flex-wrap items-center gap-2 border-b px-3 py-2 text-sm font-medium"><UnitLine u={d} /></div>
              <ul className="divide-y">
                {shownChildren(d).map((u) => (
                  <li key={u.id} className="flex flex-wrap items-center gap-2 py-1.5 pr-3 pl-8 text-sm"><UnitLine u={u} /></li>
                ))}
              </ul>
            </li>
          ))}
        </ul>
      )}

      <ReasonDialog
        open={dialog?.kind === "rename"}
        title="Переименовать подразделение"
        description="Прежнее название сохранится как псевдоним: импорт и списки со старым названием по-прежнему найдут это подразделение."
        confirmLabel="Переименовать"
        testId="rename-unit-dialog"
        onClose={() => setDialog(null)}
        onConfirm={(reason) => renameOrgUnit({ id: unit?.id, name, reason })}
        onDone={() => router.refresh()}
      >
        <div className="grid gap-2">
          <Label htmlFor="rename-unit-name">Новое название</Label>
          <Input id="rename-unit-name" value={name} onChange={(e) => setName(e.target.value)} autoFocus />
        </div>
      </ReasonDialog>
      <ReasonDialog
        open={dialog?.kind === "move"}
        title={`Переместить отдел «${unit?.name ?? ""}»`}
        description="Сотрудникам отдела обновится департамент. Участие в прошлых обучениях хранит прежнее подразделение и не меняется."
        confirmLabel="Переместить"
        testId="move-unit-dialog"
        onClose={() => setDialog(null)}
        onConfirm={(reason) => (target ? moveOrgUnit({ id: unit?.id, newParent: target, reason }) : Promise.resolve({ ok: false as const, error: "Выберите новый департамент." }))}
        onDone={() => router.refresh()}
      >
        <div className="grid gap-2">
          <Label htmlFor="move-unit-parent">Новый департамент</Label>
          <Select id="move-unit-parent" value={target} onChange={(e) => setTarget(e.target.value)}>
            <option value="">— выберите —</option>
            {activeDepartments.filter((d) => d.id !== unit?.parent_id).map((d) => (
              <option key={d.id} value={d.id}>{d.name}</option>
            ))}
          </Select>
        </div>
      </ReasonDialog>
      <ReasonDialog
        open={dialog?.kind === "alias"}
        title={`Написания «${unit?.name ?? ""}»`}
        description="Подтверждённый вариант написания (например, из файла кадров) будет находить это подразделение при импорте. Разные подразделения автоматически не объединяются."
        confirmLabel="Закрепить написание"
        testId="alias-unit-dialog"
        onClose={() => setDialog(null)}
        onConfirm={(reason) => addOrgUnitAlias({ id: unit?.id, alias, reason })}
        onDone={() => router.refresh()}
      >
        <div className="grid gap-2">
          <Label htmlFor="alias-unit-name">Вариант написания</Label>
          <Input id="alias-unit-name" value={alias} onChange={(e) => setAlias(e.target.value)} autoFocus />
        </div>
      </ReasonDialog>
      <OrgUnitsBulkDialog open={bulkOpen} onClose={() => setBulkOpen(false)} units={units} aliases={aliases} />
      <ReasonDialog
        open={dialog?.kind === "active"}
        title={unit?.is_active ? `Деактивировать «${unit?.name ?? ""}»` : `Восстановить «${unit?.name ?? ""}»`}
        description={unit?.is_active ? "Подразделение скроется из выбора, история и ссылки сохранятся. Если у департамента есть действующие отделы, система не даст его деактивировать." : "Подразделение снова появится в выборе. Отдел можно восстановить только при действующем департаменте."}
        confirmLabel={unit?.is_active ? "Деактивировать" : "Восстановить"}
        destructive={unit?.is_active}
        testId="active-unit-dialog"
        onClose={() => setDialog(null)}
        onConfirm={(reason) => setOrgUnitActive({ id: unit?.id, active: !unit?.is_active, reason })}
        onDone={() => router.refresh()}
      />
    </div>
  );
}
