"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Building2, MoveRight, Pencil, Plus, Power, PowerOff } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { FormAlert } from "@/components/auth/form-parts";
import { EmptyState } from "@/components/common/states";
import { ReasonDialog } from "@/components/workflow/reason-dialog";
import { useToast } from "@/components/workflow/toast";
import { createOrgUnit, moveOrgUnit, renameOrgUnit, setOrgUnitActive } from "@/app/(app)/settings/references/actions";

export type OrgUnitRow = { id: number; name: string; parent_id: number | null; level: "DEPARTMENT" | "UNIT"; is_active: boolean; employees: number };

type Dialog = null | { kind: "rename" | "move" | "active"; unit: OrgUnitRow };

/**
 * Справочник подразделений: департамент → отделы. Всё по id: переименование не ломает ссылки (прежнее название остаётся псевдонимом),
 * отдел можно переместить в другой департамент, подразделение деактивируется и восстанавливается (удаления нет).
 * Правила (например, «у департамента не должно быть действующих отделов») проверяет база, её сообщение показывается как есть.
 */
export function OrgUnitsManager({ units, canEdit }: { units: OrgUnitRow[]; canEdit: boolean }) {
  const router = useRouter();
  const { notify } = useToast();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | undefined>();
  const [dialog, setDialog] = useState<Dialog>(null);
  const [name, setName] = useState("");
  const [target, setTarget] = useState("");
  const [newName, setNewName] = useState("");
  const [parent, setParent] = useState("");
  const [showInactive, setShowInactive] = useState(false);
  const departments = units.filter((u) => u.level === "DEPARTMENT");
  const activeDepartments = departments.filter((d) => d.is_active);
  const visibleDepartments = showInactive ? departments : departments.filter((d) => d.is_active);
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
  function openDialog(kind: "rename" | "move" | "active", unit: OrgUnitRow) {
    setName(unit.name);
    setTarget("");
    setDialog({ kind, unit });
  }

  function UnitLine({ u }: { u: OrgUnitRow }) {
    return (
      <>
        <span className={u.is_active ? "" : "text-muted-foreground line-through"}>{u.name}</span>
        <span className="text-xs text-muted-foreground">сотрудников: {u.employees}</span>
        {!u.is_active && <Badge variant="outline">Неактивно</Badge>}
        {canEdit && (
          <span className="ml-auto flex flex-wrap gap-1">
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
        </form>
      )}
      {inactiveCount > 0 && (
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" className="size-4 accent-[var(--brand)]" checked={showInactive} onChange={(e) => setShowInactive(e.target.checked)} /> Показывать неактивные ({inactiveCount})
        </label>
      )}
      {visibleDepartments.length === 0 ? (
        <EmptyState className="bg-card" icon={Building2} title="Подразделений пока нет" description="Добавьте департамент, затем его отделы." />
      ) : (
        <ul className="space-y-3">
          {visibleDepartments.map((d) => (
            <li key={d.id} className="rounded-xl border bg-card shadow-xs" data-testid="department">
              <div className="flex flex-wrap items-center gap-2 border-b px-3 py-2 text-sm font-medium"><UnitLine u={d} /></div>
              <ul className="divide-y">
                {units.filter((u) => u.parent_id === d.id && (showInactive || u.is_active)).map((u) => (
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
