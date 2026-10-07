"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ClipboardPaste, Loader2, Search, Trash2, UserPlus, UserRoundPlus, Users } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { FormAlert } from "@/components/auth/form-parts";
import { EmptyState } from "@/components/common/states";
import { ReasonDialog } from "@/components/workflow/reason-dialog";
import { useToast } from "@/components/workflow/toast";
import {
  addParticipants,
  addParticipantsByUnit,
  createEmployeeFromList,
  matchParticipantNames,
  removeParticipant,
  removeParticipantsBulk,
  searchEmployees,
  setParticipantResults,
  type EmployeeOption,
} from "@/app/(app)/trainings/actions";
import { PARTICIPANT_RESULT_LABELS, PARTICIPANT_RESULT_OPTIONS, PARTICIPANT_RESULT_VARIANT } from "@/lib/trainings/labels";
import {
  MATCH_KIND_LABELS,
  canSubmitMatches,
  initialDecisions,
  parseNameLines,
  selectedEmployeeIds,
  summarize,
  type Decisions,
  type MatchRow,
} from "@/lib/trainings/name-list";
import type { ParticipantResult } from "@/lib/workflows/schemas";

export type ParticipantRow = {
  id: string;
  employee_id: string;
  full_name: string;
  canonical_id: string;
  unit: string | null;
  position: string | null;
  attended: boolean;
  session_id: string | null;
  result?: string | null;
  result_note?: string | null;
};
export type OrgUnitOption = { id: number; label: string };

// Диалог импорта списка пишется отдельно (мастер импорта). Подгружается лениво, чтобы не утяжелять карточку.
const ParticipantsImportDialog = dynamic(() => import("@/components/imports/participants-import-dialog").then((m) => m.ParticipantsImportDialog), { ssr: false });

export function ParticipantsPanel({ trainingId, participants, orgUnits, canEdit, archived, canAddEmployees }: { trainingId: string; participants: ParticipantRow[]; orgUnits: OrgUnitOption[]; canEdit: boolean; archived: boolean; canAddEmployees: boolean }) {
  const router = useRouter();
  const [adding, setAdding] = useState(false);
  const [removing, setRemoving] = useState<ParticipantRow | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulk, setBulk] = useState<null | "remove" | "result">(null);
  const [bulkResult, setBulkResult] = useState<string>("");
  const [filter, setFilter] = useState("");
  const editable = canEdit && !archived;

  const visible = useMemo(() => {
    const q = filter.trim().toLowerCase();
    return q ? participants.filter((p) => p.full_name.toLowerCase().includes(q) || (p.unit ?? "").toLowerCase().includes(q)) : participants;
  }, [participants, filter]);
  // выбор очищается от тех, кого уже нет в списке (после удаления)
  const chosen = useMemo(() => participants.filter((p) => selected.has(p.id)), [participants, selected]);
  const allVisibleChecked = visible.length > 0 && visible.every((p) => selected.has(p.id));

  function toggle(id: string, on: boolean) {
    setSelected((s) => {
      const n = new Set(s);
      if (on) n.add(id);
      else n.delete(id);
      return n;
    });
  }
  function toggleAll(on: boolean) {
    setSelected((s) => {
      const n = new Set(s);
      for (const p of visible) {
        if (on) n.add(p.id);
        else n.delete(p.id);
      }
      return n;
    });
  }

  return (
    <div className="space-y-3" data-testid="participants-panel">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-muted-foreground">Участники берутся из справочника сотрудников. Новые сотрудники из списков автоматически не создаются.</p>
        {editable && (
          <div className="flex flex-wrap gap-2">
            <ParticipantsImportDialog trainingId={trainingId} canEdit={editable} />
            <Button size="sm" onClick={() => setAdding(true)} data-testid="add-participants">
              <UserPlus aria-hidden="true" /> Добавить участников
            </Button>
          </div>
        )}
      </div>

      {participants.length > 8 && (
        <div className="relative max-w-xs">
          <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
          <Input value={filter} onChange={(e) => setFilter(e.target.value)} placeholder="Найти в списке" aria-label="Найти среди участников" className="pl-8" />
        </div>
      )}

      {editable && chosen.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 rounded-xl border bg-brand-soft/40 px-3 py-2 text-sm" role="region" aria-label="Действия над выбранными" data-testid="bulk-bar">
          <span className="font-medium">Выбрано: {chosen.length}</span>
          <Button size="sm" variant="outline" onClick={() => { setBulkResult(""); setBulk("result"); }} data-testid="bulk-result">Результат…</Button>
          <Button size="sm" variant="outline" onClick={() => setBulk("remove")} data-testid="bulk-remove"><Trash2 aria-hidden="true" /> Убрать из участников</Button>
          <Button size="sm" variant="ghost" onClick={() => setSelected(new Set())}>Снять выбор</Button>
        </div>
      )}

      {participants.length === 0 ? (
        <EmptyState className="bg-card" icon={Users} compact title="Участников пока нет" description="Добавьте сотрудников поиском, подразделением, списком ФИО или импортом." />
      ) : (
        <div className="rounded-xl border bg-card shadow-xs">
          {editable && (
            <label className="flex min-h-10 cursor-pointer items-center gap-2 border-b px-3 text-xs text-muted-foreground">
              <input type="checkbox" className="size-4 accent-[var(--brand)]" checked={allVisibleChecked} onChange={(e) => toggleAll(e.target.checked)} aria-label="Выбрать всех в списке" />
              Выбрать всех{filter ? " найденных" : ""} ({visible.length})
            </label>
          )}
          <ul className="divide-y">
            {visible.map((p) => {
              const res = p.result && p.result in PARTICIPANT_RESULT_LABELS ? (p.result as ParticipantResult) : null;
              return (
                <li key={p.id} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 text-sm" data-testid="participant-row">
                  <div className="flex min-w-0 items-start gap-2">
                    {editable && (
                      <input type="checkbox" className="mt-1 size-4 accent-[var(--brand)]" checked={selected.has(p.id)} onChange={(e) => toggle(p.id, e.target.checked)} aria-label={`Выбрать: ${p.full_name}`} />
                    )}
                    <div className="min-w-0">
                      <Link href={`/employees/${p.employee_id}`} className="font-medium hover:text-brand hover:underline">
                        {p.full_name}
                      </Link>
                      <p className="text-xs text-muted-foreground">{[p.unit, p.position].filter(Boolean).join(" · ") || "—"}</p>
                      {p.result_note && <p className="text-xs text-muted-foreground">{p.result_note}</p>}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {res && <Badge variant={PARTICIPANT_RESULT_VARIANT[res]} data-testid="participant-result">{PARTICIPANT_RESULT_LABELS[res]}</Badge>}
                    {!p.attended && <Badge variant="outline">Не присутствовал</Badge>}
                    {editable && (
                      <Button size="icon" variant="ghost" aria-label={`Убрать из списка: ${p.full_name}`} onClick={() => setRemoving(p)}>
                        <Trash2 aria-hidden="true" />
                      </Button>
                    )}
                  </div>
                </li>
              );
            })}
            {visible.length === 0 && <li className="px-3 py-4 text-sm text-muted-foreground">Никого не найдено.</li>}
          </ul>
        </div>
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
      <ReasonDialog
        open={bulk === "remove"}
        title={`Убрать из участников: ${chosen.length}`}
        description="Выбранные сотрудники будут удалены из списка вместе с отметками посещаемости. Это можно отменить в журнале изменений."
        confirmLabel="Убрать выбранных"
        destructive
        testId="bulk-remove-dialog"
        onClose={() => setBulk(null)}
        onConfirm={(reason) => removeParticipantsBulk({ trainingId, ids: chosen.map((p) => p.id), reason })}
        onDone={() => {
          setSelected(new Set());
          router.refresh();
        }}
      />
      <ReasonDialog
        open={bulk === "result"}
        title={`Результат участников: ${chosen.length}`}
        description="Итог обучения или экзамена для выбранных сотрудников. Он попадёт в досье сотрудника."
        confirmLabel="Записать результат"
        testId="bulk-result-dialog"
        onClose={() => setBulk(null)}
        onConfirm={(reason) => (bulkResult === "" ? Promise.resolve({ ok: false as const, error: "Выберите результат." }) : setParticipantResults({ trainingId, ids: chosen.map((p) => p.id), result: bulkResult === "NONE" ? null : bulkResult, reason }))}
        onDone={() => {
          setSelected(new Set());
          router.refresh();
        }}
      >
        <div className="grid gap-2">
          <Label htmlFor="bulk-result-select">Результат</Label>
          <Select id="bulk-result-select" value={bulkResult} onChange={(e) => setBulkResult(e.target.value)}>
            <option value="">— выберите —</option>
            {PARTICIPANT_RESULT_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
            <option value="NONE">Снять результат</option>
          </Select>
        </div>
      </ReasonDialog>
    </div>
  );
}

type Mode = "search" | "unit" | "paste";

function AddParticipantsDialog({ open, onClose, trainingId, orgUnits, canAddEmployees, onDone }: { open: boolean; onClose: () => void; trainingId: string; orgUnits: OrgUnitOption[]; canAddEmployees: boolean; onDone: () => void }) {
  const { notify } = useToast();
  const [mode, setMode] = useState<Mode>("search");
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<EmployeeOption[]>([]);
  const [selected, setSelected] = useState<Record<string, EmployeeOption>>({});
  const [unit, setUnit] = useState("");
  const [text, setText] = useState("");
  const [matches, setMatches] = useState<MatchRow[] | null>(null);
  const [decisions, setDecisions] = useState<Decisions>({});
  const [created, setCreated] = useState<Record<number, string>>({});
  const [notice, setNotice] = useState<string | undefined>();
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
    setText("");
    setMatches(null);
    setDecisions({});
    setCreated({});
    setNotice(undefined);
    setError(undefined);
  }
  function close() {
    if (pending) return;
    reset();
    onClose();
  }
  function finish(message: string | undefined) {
    notify(true, message ?? "Готово.");
    reset();
    onClose();
    onDone();
  }

  const parsed = useMemo(() => parseNameLines(text), [text]);

  function runMatch() {
    setError(undefined);
    setNotice(undefined);
    if (parsed.names.length === 0) return setError("Вставьте список ФИО: по одному на строку.");
    startTransition(async () => {
      const r = await matchParticipantNames({ names: parsed.names });
      if (!r.ok) return setError(r.error);
      setMatches(r.data.rows);
      setDecisions(initialDecisions(r.data.rows));
      setCreated({});
      setNotice(parsed.tooMany ? "Обработаны первые 3000 строк." : parsed.duplicates ? `Повторяющихся строк пропущено: ${parsed.duplicates}.` : undefined);
    });
  }

  function createFor(row: MatchRow) {
    setError(undefined);
    startTransition(async () => {
      const r = await createEmployeeFromList({ fullName: row.input });
      if (!r.ok) return setError(r.error);
      setDecisions((d) => ({ ...d, [row.index]: r.data.id }));
      setCreated((c) => ({ ...c, [row.index]: r.data.id }));
      notify(true, "Сотрудник создан в справочнике.");
    });
  }

  function submit() {
    setError(undefined);
    startTransition(async () => {
      let result: Awaited<ReturnType<typeof addParticipants>> | { ok: false; error: string };
      if (mode === "search") result = await addParticipants({ trainingId, employeeIds: Object.keys(selected) });
      else if (mode === "unit") result = unit ? await addParticipantsByUnit({ trainingId, orgUnitId: Number(unit) }) : { ok: false, error: "Выберите подразделение." };
      else result = matches ? await addParticipants({ trainingId, employeeIds: selectedEmployeeIds(matches, decisions) }) : { ok: false, error: "Сначала сопоставьте список." };
      if (result.ok) finish(result.message);
      else setError(result.error);
    });
  }

  const count = Object.keys(selected).length;
  const summary = matches ? summarize(matches, decisions) : null;
  const matchReady = matches ? canSubmitMatches(matches, decisions) : false;
  const submitDisabled = pending || (mode === "search" ? count === 0 : mode === "unit" ? !unit : !matchReady);
  const submitLabel = mode === "search" ? `Добавить${count ? ` (${count})` : ""}` : mode === "unit" ? "Добавить подразделение" : `Добавить${matches && matchReady ? ` (${selectedEmployeeIds(matches, decisions).length})` : ""}`;

  return (
    <Dialog open={open} onOpenChange={(o) => !o && close()}>
      <DialogContent className={mode === "paste" && matches ? "max-w-3xl" : "max-w-lg"} data-testid="add-participants-dialog">
        <DialogHeader>
          <DialogTitle>Добавить участников</DialogTitle>
          <DialogDescription>Если у тренинга есть заходы, новые участники по умолчанию отмечаются присутствующими на всех заходах.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-4">
          <FormAlert error={error} />
          <div className="flex flex-wrap gap-2" role="tablist" aria-label="Способ выбора">
            <Button type="button" size="sm" variant={mode === "search" ? "default" : "outline"} role="tab" aria-selected={mode === "search"} onClick={() => setMode("search")}>Поиск по ФИО</Button>
            <Button type="button" size="sm" variant={mode === "unit" ? "default" : "outline"} role="tab" aria-selected={mode === "unit"} onClick={() => setMode("unit")}>Всё подразделение</Button>
            <Button type="button" size="sm" variant={mode === "paste" ? "default" : "outline"} role="tab" aria-selected={mode === "paste"} onClick={() => setMode("paste")} data-testid="mode-paste">
              <ClipboardPaste aria-hidden="true" /> Список ФИО
            </Button>
          </div>

          {mode === "search" && (
            <div className="grid gap-2">
              <div className="relative">
                <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
                <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Начните вводить ФИО" aria-label="Поиск сотрудника" className="pl-8" />
              </div>
              <ul className="max-h-56 divide-y overflow-y-auto rounded-lg border" aria-label="Результаты поиска" aria-busy={searching}>
                {results.length === 0 && <li className="px-3 py-3 text-sm text-muted-foreground">{searching ? "Поиск…" : "Никого не найдено."}</li>}
                {results.map((e) => (
                  <li key={e.id}>
                    <label className="flex min-h-10 cursor-pointer items-start gap-2 px-3 py-2 text-sm hover:bg-muted/50">
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
              {count > 0 && <p className="text-xs text-muted-foreground">Выбрано: {count}. Выбор сохраняется при новом поиске.</p>}
              {canAddEmployees && (
                <p className="text-xs text-muted-foreground">
                  Нет в списке? <Link href="/employees" className="text-brand hover:underline">Добавьте сотрудника в справочнике</Link> — автоматически он не создаётся.
                </p>
              )}
            </div>
          )}

          {mode === "unit" && (
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

          {mode === "paste" && (
            <div className="grid gap-3">
              {!matches ? (
                <div className="grid gap-2">
                  <Label htmlFor="paste-names">Список ФИО (по одному на строку)</Label>
                  <Textarea id="paste-names" value={text} onChange={(e) => setText(e.target.value)} rows={8} placeholder={"Иванов Иван Иванович\nПетрова Мария"} disabled={pending} data-testid="paste-names" />
                  <p className="text-xs text-muted-foreground">
                    Строк: {parsed.names.length}
                    {parsed.duplicates > 0 ? `, повторов: ${parsed.duplicates}` : ""}. Сотрудники будут найдены в справочнике; никто не создаётся автоматически.
                  </p>
                  <div>
                    <Button type="button" size="sm" onClick={runMatch} disabled={pending || parsed.names.length === 0} data-testid="match-names">
                      {pending && <Loader2 className="animate-spin" aria-hidden="true" />} Сопоставить со справочником
                    </Button>
                  </div>
                </div>
              ) : (
                <MatchTable
                  rows={matches}
                  decisions={decisions}
                  created={created}
                  summary={summary!}
                  notice={notice}
                  pending={pending}
                  canCreate={canAddEmployees}
                  onDecide={(index, value) => setDecisions((d) => ({ ...d, [index]: value || undefined }))}
                  onSkipPending={() =>
                    setDecisions((d) => {
                      const next = { ...d };
                      for (const r of matches) if (!next[r.index]) next[r.index] = "skip";
                      return next;
                    })
                  }
                  onCreate={createFor}
                  onBack={() => {
                    setMatches(null);
                    setDecisions({});
                  }}
                />
              )}
            </div>
          )}
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={close} disabled={pending}>Отмена</Button>
          {(mode !== "paste" || matches) && (
            <Button type="button" onClick={submit} disabled={submitDisabled} data-testid="confirm-add-participants">
              {pending && <Loader2 className="animate-spin" aria-hidden="true" />}
              {submitLabel}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

const STATUS_VIEW = { FOUND: { label: "Найден", variant: "success" }, AMBIGUOUS: { label: "Неоднозначно", variant: "warning" }, NOT_FOUND: { label: "Не найден", variant: "outline" } } as const;

function MatchTable({
  rows,
  decisions,
  created,
  summary,
  notice,
  pending,
  canCreate,
  onDecide,
  onSkipPending,
  onCreate,
  onBack,
}: {
  rows: MatchRow[];
  decisions: Decisions;
  created: Record<number, string>;
  summary: ReturnType<typeof summarize>;
  notice?: string;
  pending: boolean;
  canCreate: boolean;
  onDecide: (index: number, value: string) => void;
  onSkipPending: () => void;
  onCreate: (row: MatchRow) => void;
  onBack: () => void;
}) {
  return (
    <div className="grid gap-3" data-testid="match-table">
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <Badge variant="success">Найдено: {summary.found}</Badge>
        <Badge variant="warning">Неоднозначно: {summary.ambiguous}</Badge>
        <Badge variant="outline">Не найдено: {summary.notFound}</Badge>
        <span className="text-muted-foreground">К добавлению: {summary.selected}{summary.pending ? `, без решения: ${summary.pending}` : ""}</span>
      </div>
      {notice && <p className="text-xs text-muted-foreground">{notice}</p>}
      {summary.duplicatePicks > 0 && <p className="text-xs text-warning">Один сотрудник выбран в нескольких строках: он будет добавлен один раз.</p>}
      <ul className="max-h-[50vh] divide-y overflow-y-auto rounded-lg border" aria-label="Результат сопоставления">
        {rows.map((r) => {
          const v = STATUS_VIEW[r.status];
          const value = decisions[r.index] ?? "";
          const fieldId = `match-${r.index}`;
          return (
            <li key={r.index} className="grid gap-2 px-3 py-2 text-sm sm:grid-cols-[1fr_1.2fr]" data-testid="match-row" data-status={r.status}>
              <div className="min-w-0">
                <p className="font-medium break-words">{r.input}</p>
                <Badge variant={v.variant}>{v.label}</Badge>
                {created[r.index] && <Badge variant="brand" className="ml-1">Создан</Badge>}
              </div>
              <div className="grid gap-1">
                <Label htmlFor={fieldId} className="sr-only">Сотрудник для строки «{r.input}»</Label>
                <Select id={fieldId} value={value} onChange={(e) => onDecide(r.index, e.target.value)} disabled={pending} aria-invalid={!value ? true : undefined}>
                  <option value="">— выберите решение —</option>
                  {r.candidates.map((c) => (
                    <option key={c.employee_id} value={c.employee_id}>
                      {c.full_name}
                      {c.position ? ` · ${c.position}` : ""} ({MATCH_KIND_LABELS[c.match_kind] ?? c.match_kind})
                    </option>
                  ))}
                  {created[r.index] && <option value={created[r.index]}>Новый сотрудник: {r.input}</option>}
                  <option value="skip">Пропустить строку</option>
                </Select>
                {r.status === "NOT_FOUND" && canCreate && !created[r.index] && (
                  <Button type="button" size="sm" variant="outline" onClick={() => onCreate(r)} disabled={pending} data-testid="create-employee-row">
                    <UserRoundPlus aria-hidden="true" /> Создать в справочнике
                  </Button>
                )}
              </div>
            </li>
          );
        })}
      </ul>
      <div className="flex flex-wrap gap-2">
        <Button type="button" size="sm" variant="outline" onClick={onBack} disabled={pending}>Изменить список</Button>
        {summary.pending > 0 && <Button type="button" size="sm" variant="outline" onClick={onSkipPending} disabled={pending}>Пропустить все без решения ({summary.pending})</Button>}
      </div>
    </div>
  );
}
