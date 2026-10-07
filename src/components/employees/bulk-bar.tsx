"use client";

import { useState } from "react";
import { Building2, Briefcase, UserCheck, UserX, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { ReasonDialog } from "@/components/workflow/reason-dialog";
import { bulkUpdateEmployees } from "@/app/(app)/employees/actions";
import type { OrgOption } from "./new-employee-dialog";

type Mode = "move" | "position" | "deactivate" | "activate" | null;

/** Панель массовых действий над выбранными сотрудниками. Результат — через bulk_update_employees (причина обязательна). */
export function BulkBar({ ids, orgUnits, onClear, onDone }: { ids: string[]; orgUnits: OrgOption[]; onClear: () => void; onDone: () => void }) {
  const [mode, setMode] = useState<Mode>(null);
  const [dept, setDept] = useState("");
  const [unit, setUnit] = useState("");
  const [position, setPosition] = useState("");
  const departments = orgUnits.filter((u) => u.level === "DEPARTMENT");
  const units = orgUnits.filter((u) => u.level === "UNIT" && (!dept || String(u.parent_id) === dept));
  const n = ids.length;

  function close() {
    setMode(null);
  }
  async function confirm(reason: string) {
    const change =
      mode === "move" ? { action: "move", department_id: dept || null, unit_id: unit || null } : mode === "position" ? { action: "position", position } : { action: "status", is_active: mode === "activate" };
    return bulkUpdateEmployees({ ids, change, reason });
  }

  const titles: Record<Exclude<Mode, null>, string> = {
    move: "Сменить подразделение",
    position: "Сменить должность",
    deactivate: "Деактивировать сотрудников",
    activate: "Активировать сотрудников",
  };

  return (
    <>
      <div role="region" aria-label="Массовые действия" data-testid="bulk-bar" className="sticky bottom-3 z-10 flex flex-wrap items-center gap-2 rounded-xl border bg-card p-3 shadow-lg">
        <span className="mr-auto text-sm font-medium" aria-live="polite">Выбрано: {n}</span>
        <Button type="button" size="sm" variant="outline" className="min-h-10" onClick={() => setMode("move")} data-testid="bulk-move"><Building2 aria-hidden="true" /> Подразделение</Button>
        <Button type="button" size="sm" variant="outline" className="min-h-10" onClick={() => setMode("position")} data-testid="bulk-position"><Briefcase aria-hidden="true" /> Должность</Button>
        <Button type="button" size="sm" variant="outline" className="min-h-10" onClick={() => setMode("activate")} data-testid="bulk-activate"><UserCheck aria-hidden="true" /> Активировать</Button>
        <Button type="button" size="sm" variant="outline" className="min-h-10" onClick={() => setMode("deactivate")} data-testid="bulk-deactivate"><UserX aria-hidden="true" /> Деактивировать</Button>
        <Button type="button" size="sm" variant="ghost" className="min-h-10" onClick={onClear} aria-label="Снять выбор"><X aria-hidden="true" /></Button>
      </div>
      {mode && (
        <ReasonDialog
          open
          testId="bulk-dialog"
          title={titles[mode]}
          description={`Будет изменено сотрудников: ${n}. Изменение попадёт в журнал с указанной причиной.`}
          confirmLabel="Применить"
          destructive={mode === "deactivate"}
          onClose={close}
          onConfirm={confirm}
          onDone={onDone}
        >
          {mode === "move" && (
            <div className="grid gap-3">
              <div className="grid gap-2">
                <Label htmlFor="bulk-dept">Департамент</Label>
                <Select id="bulk-dept" value={dept} onChange={(e) => { setDept(e.target.value); setUnit(""); }}>
                  <option value="">— не менять / выберите —</option>
                  {departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
                </Select>
              </div>
              <div className="grid gap-2">
                <Label htmlFor="bulk-unit">Отдел</Label>
                <Select id="bulk-unit" value={unit} onChange={(e) => setUnit(e.target.value)}>
                  <option value="">— без отдела —</option>
                  {units.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
                </Select>
              </div>
              <p className="text-xs text-muted-foreground">Если выбран только департамент, отдел у сотрудников будет сброшен.</p>
            </div>
          )}
          {mode === "position" && (
            <div className="grid gap-2">
              <Label htmlFor="bulk-position-input">Новая должность</Label>
              <Input id="bulk-position-input" value={position} onChange={(e) => setPosition(e.target.value)} maxLength={200} placeholder="Оставьте пустым, чтобы очистить" />
            </div>
          )}
        </ReasonDialog>
      )}
    </>
  );
}
