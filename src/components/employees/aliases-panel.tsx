"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ReasonDialog } from "@/components/workflow/reason-dialog";
import { addEmployeeAlias, removeEmployeeAlias } from "@/app/(app)/employees/actions";

export type AliasRow = { id: number; alias_norm: string; confidence: number | null; confirmed_by_name: string | null };

/** Подтверждённые написания ФИО. Нужны, чтобы при импорте «Иванов П.» однозначно относилось к этому сотруднику. Автоматического слияния нет. */
export function AliasesPanel({ employeeId, aliases, canEdit }: { employeeId: string; aliases: AliasRow[]; canEdit: boolean }) {
  const router = useRouter();
  const [adding, setAdding] = useState(false);
  const [alias, setAlias] = useState("");
  const [removing, setRemoving] = useState<AliasRow | null>(null);

  return (
    <div className="space-y-3" data-testid="aliases-panel">
      {aliases.length === 0 ? (
        <p className="text-sm text-muted-foreground">Закреплённых написаний нет.</p>
      ) : (
        <ul className="divide-y rounded-lg border">
          {aliases.map((a) => (
            <li key={a.id} className="flex items-center justify-between gap-2 px-3 py-2 text-sm">
              <span>
                {a.alias_norm}
                {a.confirmed_by_name && <span className="ml-2 text-xs text-muted-foreground">подтвердил: {a.confirmed_by_name}</span>}
              </span>
              {canEdit && (
                <Button size="icon" variant="ghost" aria-label={`Удалить написание ${a.alias_norm}`} onClick={() => setRemoving(a)}>
                  <Trash2 aria-hidden="true" />
                </Button>
              )}
            </li>
          ))}
        </ul>
      )}
      {canEdit && (
        <Button size="sm" variant="outline" onClick={() => { setAlias(""); setAdding(true); }} data-testid="add-alias">
          <Plus aria-hidden="true" /> Закрепить написание
        </Button>
      )}
      <ReasonDialog
        open={adding}
        title="Закрепить написание ФИО"
        description="Это написание будет однозначно относиться к сотруднику при сопоставлении данных."
        confirmLabel="Закрепить"
        testId="alias-dialog"
        onClose={() => setAdding(false)}
        onConfirm={(reason) => addEmployeeAlias({ employeeId, alias, reason })}
        onDone={() => router.refresh()}
      >
        <div className="grid gap-2">
          <Label htmlFor="alias-input">Написание (например, «Иванов П.»)</Label>
          <Input id="alias-input" value={alias} onChange={(e) => setAlias(e.target.value)} autoComplete="off" />
        </div>
      </ReasonDialog>
      <ReasonDialog
        open={removing !== null}
        title="Удалить написание"
        confirmLabel="Удалить"
        destructive
        testId="remove-alias-dialog"
        onClose={() => setRemoving(null)}
        onConfirm={(reason) => removeEmployeeAlias({ aliasId: removing?.id ?? 0, employeeId, reason })}
        onDone={() => router.refresh()}
      />
    </div>
  );
}
