"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Building2, Check, Loader2, Pencil, Plus, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { FormAlert } from "@/components/auth/form-parts";
import { EmptyState } from "@/components/common/states";
import { useToast } from "@/components/workflow/toast";
import { createOrgUnit, updateOrgUnit } from "@/app/(app)/settings/references/actions";

export type OrgUnitRow = { id: number; name: string; parent_id: number | null; level: "DEPARTMENT" | "UNIT"; is_active: boolean; employees: number };

/** Справочник подразделений: департамент → отделы. Правки идут в журнал изменений (аудит). Удаления нет: подразделение деактивируется. */
export function OrgUnitsManager({ units, canEdit }: { units: OrgUnitRow[]; canEdit: boolean }) {
  const router = useRouter();
  const { notify } = useToast();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | undefined>();
  const [editing, setEditing] = useState<number | null>(null);
  const [name, setName] = useState("");
  const [newName, setNewName] = useState("");
  const [parent, setParent] = useState("");
  const departments = units.filter((u) => u.level === "DEPARTMENT");

  function run(task: () => Promise<{ ok: true; message?: string } | { ok: false; error: string }>, after?: () => void) {
    setError(undefined);
    start(async () => {
      const r = await task();
      if (r.ok) {
        notify(true, r.message ?? "Готово.");
        after?.();
        router.refresh();
      } else setError(r.error);
    });
  }

  function UnitLine({ u }: { u: OrgUnitRow }) {
    if (editing === u.id) {
      return (
        <form className="flex flex-1 items-center gap-2" onSubmit={(e) => { e.preventDefault(); run(() => updateOrgUnit({ id: u.id, name }), () => setEditing(null)); }}>
          <Input value={name} onChange={(e) => setName(e.target.value)} aria-label="Название подразделения" autoFocus disabled={pending} />
          <Button type="submit" size="icon" variant="ghost" aria-label="Сохранить" disabled={pending}>{pending ? <Loader2 className="animate-spin" /> : <Check />}</Button>
          <Button type="button" size="icon" variant="ghost" aria-label="Отмена" onClick={() => setEditing(null)} disabled={pending}><X /></Button>
        </form>
      );
    }
    return (
      <>
        <span className={u.is_active ? "" : "text-muted-foreground line-through"}>{u.name}</span>
        <span className="text-xs text-muted-foreground">сотрудников: {u.employees}</span>
        {!u.is_active && <Badge variant="outline">Неактивно</Badge>}
        {canEdit && (
          <span className="ml-auto flex gap-1">
            <Button size="icon" variant="ghost" aria-label={`Переименовать ${u.name}`} onClick={() => { setName(u.name); setEditing(u.id); }}><Pencil /></Button>
            <Button size="sm" variant="ghost" onClick={() => run(() => updateOrgUnit({ id: u.id, isActive: !u.is_active }))} disabled={pending}>{u.is_active ? "Деактивировать" : "Включить"}</Button>
          </span>
        )}
      </>
    );
  }

  return (
    <div className="space-y-4" data-testid="org-units">
      <FormAlert error={error} />
      {canEdit && (
        <form className="flex flex-wrap items-end gap-2 rounded-xl border bg-card p-3 shadow-xs" onSubmit={(e) => { e.preventDefault(); run(() => createOrgUnit({ name: newName, parentId: parent || null }), () => setNewName("")); }}>
          <div className="grid gap-1">
            <Label htmlFor="new-unit-name" className="text-xs">Название</Label>
            <Input id="new-unit-name" value={newName} onChange={(e) => setNewName(e.target.value)} disabled={pending} className="min-w-60" />
          </div>
          <div className="grid gap-1">
            <Label htmlFor="new-unit-parent" className="text-xs">Тип</Label>
            <Select id="new-unit-parent" value={parent} onChange={(e) => setParent(e.target.value)} disabled={pending} className="min-w-60">
              <option value="">Департамент</option>
              {departments.map((d) => (
                <option key={d.id} value={d.id}>Отдел в «{d.name}»</option>
              ))}
            </Select>
          </div>
          <Button type="submit" disabled={pending || newName.trim().length < 2}><Plus aria-hidden="true" /> Добавить</Button>
        </form>
      )}
      {departments.length === 0 ? (
        <EmptyState className="bg-card" icon={Building2} title="Подразделений пока нет" description="Добавьте департамент, затем его отделы." />
      ) : (
        <ul className="space-y-3">
          {departments.map((d) => (
            <li key={d.id} className="rounded-xl border bg-card shadow-xs">
              <div className="flex flex-wrap items-center gap-2 border-b px-3 py-2 text-sm font-medium"><UnitLine u={d} /></div>
              <ul className="divide-y">
                {units.filter((u) => u.parent_id === d.id).map((u) => (
                  <li key={u.id} className="flex flex-wrap items-center gap-2 py-1.5 pr-3 pl-8 text-sm"><UnitLine u={u} /></li>
                ))}
              </ul>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
