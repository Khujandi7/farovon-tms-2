"use client";

import { useEffect, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Loader2, Search, Trash2, UserPlus, Users } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { FormAlert } from "@/components/auth/form-parts";
import { EmptyState } from "@/components/common/states";
import { ReasonDialog } from "@/components/workflow/reason-dialog";
import { useToast } from "@/components/workflow/toast";
import { addParticipants, addParticipantsByUnit, removeParticipant, searchEmployees, type EmployeeOption } from "@/app/(app)/trainings/actions";

export type ParticipantRow = { id: string; employee_id: string; full_name: string; canonical_id: string; unit: string | null; position: string | null; attended: boolean; session_id: string | null };
export type OrgUnitOption = { id: number; label: string };

export function ParticipantsPanel({ trainingId, participants, orgUnits, canEdit, archived, canAddEmployees }: { trainingId: string; participants: ParticipantRow[]; orgUnits: OrgUnitOption[]; canEdit: boolean; archived: boolean; canAddEmployees: boolean }) {
  const router = useRouter();
  const [adding, setAdding] = useState(false);
  const [removing, setRemoving] = useState<ParticipantRow | null>(null);
  const editable = canEdit && !archived;

  return (
    <div className="space-y-3" data-testid="participants-panel">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-muted-foreground">Участники берутся из справочника сотрудников. Новые сотрудники из списков автоматически не создаются.</p>
        {editable && (
          <Button size="sm" onClick={() => setAdding(true)} data-testid="add-participants">
            <UserPlus aria-hidden="true" /> Добавить участников
          </Button>
        )}
      </div>
      {participants.length === 0 ? (
        <EmptyState className="bg-card" icon={Users} compact title="Участников пока нет" description="Добавьте сотрудников поиском или целым подразделением." />
      ) : (
        <ul className="divide-y rounded-xl border bg-card shadow-xs">
          {participants.map((p) => (
            <li key={p.id} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 text-sm" data-testid="participant-row">
              <div className="min-w-0">
                <Link href={`/employees/${p.employee_id}`} className="font-medium hover:text-brand hover:underline">
                  {p.full_name}
                </Link>
                <p className="text-xs text-muted-foreground">
                  {[p.unit, p.position].filter(Boolean).join(" · ") || "—"}
                </p>
              </div>
              <div className="flex items-center gap-2">
                {!p.attended && <Badge variant="outline">Не присутствовал</Badge>}
                {editable && (
                  <Button size="icon" variant="ghost" aria-label={`Убрать из списка: ${p.full_name}`} onClick={() => setRemoving(p)}>
                    <Trash2 aria-hidden="true" />
                  </Button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}

      <AddParticipantsDialog open={adding} onClose={() => setAdding(false)} trainingId={trainingId} orgUnits={orgUnits} canAddEmployees={canAddEmployees} onDone={() => router.refresh()} />

      <ReasonDialog
        open={removing !== null}
        title="Убрать участника"
        description={removing ? `${removing.full_name} будет удалён из списка, его отметки посещаемости тоже. Это можно отменить в журнале изменений.` : undefined}
        confirmLabel="Убрать"
        destructive
        testId="remove-participant-dialog"
        onClose={() => setRemoving(null)}
        onConfirm={(reason) => removeParticipant({ id: removing?.id ?? "", trainingId, reason })}
        onDone={() => router.refresh()}
      />
    </div>
  );
}

function AddParticipantsDialog({ open, onClose, trainingId, orgUnits, canAddEmployees, onDone }: { open: boolean; onClose: () => void; trainingId: string; orgUnits: OrgUnitOption[]; canAddEmployees: boolean; onDone: () => void }) {
  const { notify } = useToast();
  const [mode, setMode] = useState<"search" | "unit">("search");
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<EmployeeOption[]>([]);
  const [selected, setSelected] = useState<Record<string, EmployeeOption>>({});
  const [unit, setUnit] = useState("");
  const [error, setError] = useState<string | undefined>();
  const [pending, startTransition] = useTransition();
  const [resultsFor, setResultsFor] = useState<string | null>(null);
  const searching = resultsFor !== query;

  useEffect(() => {
    if (!open || mode !== "search") return;
    let cancelled = false;
    const t = setTimeout(async () => {
      const found = await searchEmployees(query);
      if (!cancelled) {
        setResults(found);
        setResultsFor(query);
      }
    }, 250);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [open, mode, query]);

  function reset() {
    setSelected({});
    setQuery("");
    setUnit("");
    setError(undefined);
  }
  function close() {
    if (pending) return;
    reset();
    onClose();
  }
  function submit() {
    setError(undefined);
    startTransition(async () => {
      const result =
        mode === "search"
          ? await addParticipants({ trainingId, employeeIds: Object.keys(selected) })
          : unit
            ? await addParticipantsByUnit({ trainingId, orgUnitId: Number(unit) })
            : { ok: false as const, error: "Выберите подразделение." };
      if (result.ok) {
        notify(true, result.message ?? "Готово.");
        reset();
        onClose();
        onDone();
      } else {
        setError(result.error);
      }
    });
  }
  const count = Object.keys(selected).length;

  return (
    <Dialog open={open} onOpenChange={(o) => !o && close()}>
      <DialogContent className="max-w-lg" data-testid="add-participants-dialog">
        <DialogHeader>
          <DialogTitle>Добавить участников</DialogTitle>
          <DialogDescription>Если у тренинга есть заходы, новые участники по умолчанию отмечаются присутствующими на всех заходах.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-4">
          <FormAlert error={error} />
          <div className="flex gap-2" role="tablist" aria-label="Способ выбора">
            <Button type="button" size="sm" variant={mode === "search" ? "default" : "outline"} role="tab" aria-selected={mode === "search"} onClick={() => setMode("search")}>Поиск по ФИО</Button>
            <Button type="button" size="sm" variant={mode === "unit" ? "default" : "outline"} role="tab" aria-selected={mode === "unit"} onClick={() => setMode("unit")}>Всё подразделение</Button>
          </div>
          {mode === "search" ? (
            <div className="grid gap-2">
              <div className="relative">
                <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
                <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Начните вводить ФИО" aria-label="Поиск сотрудника" className="pl-8" />
              </div>
              <ul className="max-h-56 divide-y overflow-y-auto rounded-lg border" aria-label="Результаты поиска" aria-busy={searching}>
                {results.length === 0 && <li className="px-3 py-3 text-sm text-muted-foreground">{searching ? "Поиск…" : "Никого не найдено."}</li>}
                {results.map((e) => (
                  <li key={e.id}>
                    <label className="flex cursor-pointer items-start gap-2 px-3 py-2 text-sm hover:bg-muted/50">
                      <input
                        type="checkbox"
                        className="mt-0.5 size-4 accent-[var(--brand)]"
                        checked={Boolean(selected[e.id])}
                        onChange={(ev) =>
                          setSelected((s) => {
                            const next = { ...s };
                            if (ev.target.checked) next[e.id] = e;
                            else delete next[e.id];
                            return next;
                          })
                        }
                      />
                      <span>
                        <span className="font-medium">{e.full_name}</span>
                        <span className="block text-xs text-muted-foreground">{[e.unit, e.position].filter(Boolean).join(" · ") || "—"}</span>
                      </span>
                    </label>
                  </li>
                ))}
              </ul>
              {canAddEmployees && (
                <p className="text-xs text-muted-foreground">
                  Нет в списке? <Link href="/employees" className="text-brand hover:underline">Добавьте сотрудника в справочнике</Link> — автоматически он не создаётся.
                </p>
              )}
            </div>
          ) : (
            <div className="grid gap-2">
              <Label htmlFor="unit-select">Подразделение</Label>
              <Select id="unit-select" value={unit} onChange={(e) => setUnit(e.target.value)}>
                <option value="">— выберите —</option>
                {orgUnits.map((u) => (
                  <option key={u.id} value={u.id}>{u.label}</option>
                ))}
              </Select>
              <p className="text-xs text-muted-foreground">Добавятся все активные сотрудники департамента или отдела, которых ещё нет в списке.</p>
            </div>
          )}
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={close} disabled={pending}>Отмена</Button>
          <Button type="button" onClick={submit} disabled={pending || (mode === "search" ? count === 0 : !unit)} data-testid="confirm-add-participants">
            {pending && <Loader2 className="animate-spin" aria-hidden="true" />}
            {mode === "search" ? `Добавить${count ? ` (${count})` : ""}` : "Добавить подразделение"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
