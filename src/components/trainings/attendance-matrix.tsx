"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, Loader2, RotateCcw, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { FormAlert } from "@/components/auth/form-parts";
import { EmptyState } from "@/components/common/states";
import { useToast } from "@/components/workflow/toast";
import { saveAttendance } from "@/app/(app)/trainings/actions";
import { ATTENDANCE_LABELS } from "@/lib/labels";
import { formatNumber } from "@/lib/format";
import type { SessionRow } from "./sessions-panel";
import type { ParticipantRow } from "./participants-panel";

type Status = "PRESENT" | "ABSENT" | "EXCUSED";
export type AttendanceCell = { participant_id: string; session_id: string; status: Status };
const ORDER: Status[] = ["PRESENT", "ABSENT", "EXCUSED"];
const SHORT: Record<Status, string> = { PRESENT: "✓", ABSENT: "✗", EXCUSED: "У" };
const key = (p: string, s: string) => `${p}:${s}`;

/**
 * Матрица «участник × заход». Клик по ячейке меняет статус (присутствовал → отсутствовал → уважительная причина).
 * Сохранение — одним пакетом с обязательной причиной; человеко-часы пересчитывает база.
 * Если отметок ещё нет (старые данные), показывается прежний расчёт; первая сохранённая отметка включает режим посещаемости.
 */
export function AttendanceMatrix({ trainingId, sessions, participants, cells, attendanceMode, canEdit, archived }: { trainingId: string; sessions: SessionRow[]; participants: ParticipantRow[]; cells: AttendanceCell[]; attendanceMode: boolean; canEdit: boolean; archived: boolean }) {
  const router = useRouter();
  const { notify } = useToast();
  const base = useMemo(() => new Map(cells.map((c) => [key(c.participant_id, c.session_id), c.status])), [cells]);
  const [edits, setEdits] = useState<Record<string, Status>>({});
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | undefined>();
  const [pending, startTransition] = useTransition();
  const editable = canEdit && !archived;

  if (sessions.length === 0) return <EmptyState className="bg-card" compact title="Нет заходов" description="Посещаемость отмечается по заходам. Сначала добавьте заход на вкладке «Заходы»." />;
  if (participants.length === 0) return <EmptyState className="bg-card" compact title="Нет участников" description="Добавьте участников на вкладке «Участники»." />;

  /** Сохранённое состояние ячейки. До включения режима посещаемости участник присутствовал на своём заходе (или на всех, если заход не назначен). */
  function saved(p: ParticipantRow, s: SessionRow): Status | null {
    const stored = base.get(key(p.id, s.id));
    if (stored) return stored;
    if (attendanceMode) return null;
    return p.attended && (p.session_id === null || p.session_id === s.id) ? "PRESENT" : "ABSENT";
  }
  function current(p: ParticipantRow, s: SessionRow): Status | null {
    return edits[key(p.id, s.id)] ?? saved(p, s);
  }
  function setCell(out: Record<string, Status>, p: ParticipantRow, s: SessionRow, next: Status) {
    const k = key(p.id, s.id);
    if (next === saved(p, s)) delete out[k];
    else out[k] = next;
  }
  function cycle(p: ParticipantRow, s: SessionRow) {
    if (!editable) return;
    const cur = current(p, s);
    const next = (cur === null ? "PRESENT" : ORDER[(ORDER.indexOf(cur) + 1) % ORDER.length]) as Status;
    setEdits((e) => {
      const out = { ...e };
      setCell(out, p, s, next);
      return out;
    });
  }
  function markAll(s: SessionRow, status: Status) {
    if (!editable) return;
    setEdits((e) => {
      const out = { ...e };
      for (const p of participants) setCell(out, p, s, status);
      return out;
    });
  }
  const changed = Object.keys(edits).length;
  function save() {
    setError(undefined);
    if (reason.trim().length < 3) return setError("Укажите причину изменения посещаемости (не короче 3 символов).");
    const updates = Object.entries(edits).map(([k, status]) => {
      const [participant_id, session_id] = k.split(":");
      return { participant_id, session_id, status };
    });
    startTransition(async () => {
      const result = await saveAttendance({ trainingId, updates, reason });
      if (result.ok) {
        notify(true, result.message ?? "Сохранено.");
        setEdits({});
        setReason("");
        router.refresh();
      } else setError(result.error);
    });
  }

  return (
    <div className="space-y-3" data-testid="attendance-matrix">
      {!attendanceMode && (
        <p className="rounded-lg border border-dashed bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
          Отметок посещаемости ещё нет: человеко-часы считаются по прежнему правилу. После первого сохранения часы будут считаться по присутствию на заходах.
        </p>
      )}
      <div className="overflow-x-auto rounded-xl border bg-card shadow-xs">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b">
              <th className="sticky left-0 z-10 min-w-48 bg-card px-3 py-2 text-left text-xs font-medium text-muted-foreground">Участник</th>
              {sessions.map((s) => (
                <th key={s.id} className="px-2 py-2 text-center text-xs font-medium text-muted-foreground">
                  <div>Заход {s.session_no}</div>
                  <div className="font-normal">{formatNumber(s.hours)} ч</div>
                  {editable && (
                    <button type="button" className="mt-1 text-[11px] text-brand hover:underline" onClick={() => markAll(s, "PRESENT")}>
                      все ✓
                    </button>
                  )}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {participants.map((p) => (
              <tr key={p.id} className="border-b last:border-0">
                <td className="sticky left-0 bg-card px-3 py-1.5 font-medium">{p.full_name}</td>
                {sessions.map((s) => {
                  const st = current(p, s);
                  const dirty = key(p.id, s.id) in edits;
                  return (
                    <td key={s.id} className="px-2 py-1 text-center">
                      <button
                        type="button"
                        disabled={!editable || pending}
                        onClick={() => cycle(p, s)}
                        aria-label={`${p.full_name}, заход ${s.session_no}: ${st ? ATTENDANCE_LABELS[st] : "нет отметки"}`}
                        data-status={st ?? "NONE"}
                        data-testid="attendance-cell"
                        className={
                          "inline-flex size-8 items-center justify-center rounded-md border text-sm font-semibold transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none disabled:cursor-default " +
                          (st === "PRESENT" ? "border-success/40 bg-success/15 text-success" : st === "ABSENT" ? "border-destructive/40 bg-destructive/10 text-destructive" : st === "EXCUSED" ? "border-warning/40 bg-warning/15 text-warning" : "border-dashed text-muted-foreground") +
                          (dirty ? " ring-2 ring-brand/60" : "")
                        }
                      >
                        {st ? SHORT[st] : "–"}
                      </button>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-muted-foreground">✓ присутствовал · ✗ отсутствовал · У — уважительная причина. Считаются только «присутствовал».</p>
      {editable && changed > 0 && (
        <div className="grid gap-2 rounded-lg border bg-card p-3 shadow-xs" data-testid="attendance-save-bar">
          <FormAlert error={error} />
          <label htmlFor="attendance-reason" className="text-xs font-medium text-muted-foreground">Причина изменения * (изменений: {changed})</label>
          <Input id="attendance-reason" value={reason} onChange={(e) => setReason(e.target.value)} disabled={pending} placeholder="Например: сверка с листом регистрации" onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), save())} />
          <div className="flex gap-2">
            <Button size="sm" onClick={save} disabled={pending} data-testid="save-attendance">
              {pending ? <Loader2 className="animate-spin" aria-hidden="true" /> : <Check aria-hidden="true" />} Сохранить
            </Button>
            <Button size="sm" variant="outline" onClick={() => { setEdits({}); setReason(""); setError(undefined); }} disabled={pending}>
              <RotateCcw aria-hidden="true" /> Сбросить
            </Button>
          </div>
        </div>
      )}
      {!editable && archived && <p className="flex items-center gap-1 text-xs text-muted-foreground"><X className="size-3" aria-hidden="true" /> Тренинг в архиве: посещаемость не меняется.</p>}
    </div>
  );
}
