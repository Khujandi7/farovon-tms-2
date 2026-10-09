"use client";

import { useCallback, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Check, Loader2, RefreshCw } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { FormAlert } from "@/components/auth/form-parts";
import { ReasonDialog } from "@/components/workflow/reason-dialog";
import { useToast } from "@/components/workflow/toast";
import { applyResolvedRows, previewResolvedRows, reanalyzeImportJob, type ResolvedPreview } from "@/app/(app)/imports/actions";
import { COMMIT_BATCH_MAX, COMMIT_BATCH_MIN, nextBatchSize, safeAction } from "@/lib/imports/batch";

const MAX_STEPS = 400; // предохранитель: 5000 строк / минимум 20 в пакете = 250 вызовов
const STEP_ROWS = 100; // разбор подразделений: ≈5 мс на строку
const APPLY_START_ROWS = 40; // применение: создание сотрудника ≈20–40 мс на строку (next_employee_code); размер пакета адаптивный, цель ≈2,5 с
type Totals = { created: number; updated: number; unchanged: number; needsReview: number; errors: number; processed: number };
const ZERO: Totals = { created: 0, updated: 0, unchanged: 0, needsReview: 0, errors: 0, processed: 0 };

/**
 * Дозавершение уже применённого импорта сотрудников: строки с замечанием «Подразделение не найдено» были пропущены.
 * 1) «Перепроверить» — пакетный повторный разбор всех таких строк (созданные подразделения и подтверждённые написания учитываются);
 * 2) предпросмотр — сколько строк готово, сколько нерешено, сколько с ошибкой;
 * 3) явное подтверждение с причиной → пакетное применение с прогрессом. Каждый шаг идемпотентен, после сбоя или перезагрузки можно продолжить.
 */
export function ImportFinishPanel({ jobId, initial }: { jobId: string; initial: ResolvedPreview | null }) {
  const router = useRouter();
  const { notify } = useToast();
  const [pv, setPv] = useState<ResolvedPreview | null>(initial);
  const [error, setError] = useState<string | undefined>(initial ? undefined : "Не удалось загрузить предпросмотр. Обновите страницу.");
  const [busy, setBusy] = useState<"reanalyze" | "apply" | null>(null);
  const [progress, setProgress] = useState<{ done: number; total: number; label: string } | null>(null);
  const [summary, setSummary] = useState<Totals | null>(null);
  const [reanalyzeNote, setReanalyzeNote] = useState<string | undefined>();
  const [dlg, setDlg] = useState(false);

  const load = useCallback(async () => {
    const r = await safeAction(() => previewResolvedRows({ jobId }));
    if (r.ok) setPv(r.data);
    else setError(r.error);
  }, [jobId]);

  async function reanalyze() {
    if (!pv) return;
    setBusy("reanalyze"); setError(undefined); setReanalyzeNote(undefined);
    const total = pv.unresolvedUnits;
    let after = 0, done = 0, resolved = 0, unresolved = 0, errors = 0, firstError: string | null = null;
    try {
      for (let i = 0; i < MAX_STEPS; i++) {
        const r = await safeAction(() => reanalyzeImportJob({ jobId, after, limit: STEP_ROWS }));
        if (!r.ok) { setError(r.error); return; }
        after = r.data.nextAfter; done += r.data.processed; resolved += r.data.resolved; unresolved += r.data.unresolved; errors += r.data.errors;
        firstError = firstError ?? r.data.firstError;
        setProgress({ done, total, label: "Повторный разбор подразделений" });
        if (r.data.done) break;
      }
      setReanalyzeNote(`Проверено строк: ${done}. Подразделение найдено: ${resolved}. Всё ещё не найдено: ${unresolved}.${errors ? ` Ошибок: ${errors}${firstError ? ` (${firstError})` : ""}.` : ""}`);
      notify(true, "Повторный разбор завершён.");
    } finally {
      setBusy(null); setProgress(null);
      await load();
      router.refresh();
    }
  }

  async function apply(reason: string): Promise<{ ok: true; message?: string } | { ok: false; error: string }> {
    if (!pv) return { ok: false, error: "Нет данных предпросмотра." };
    setBusy("apply"); setError(undefined); setSummary(null);
    const total = pv.ready;
    const sum: Totals = { ...ZERO };
    let after = 0;
    let limit = APPLY_START_ROWS;
    try {
      for (let i = 0; i < MAX_STEPS; i++) {
        const t0 = performance.now();
        const lim = Math.max(COMMIT_BATCH_MIN, Math.min(COMMIT_BATCH_MAX, limit));
        const r = await safeAction(() => applyResolvedRows({ jobId, after, limit: lim, reason, confirmed: true }));
        limit = nextBatchSize(lim, performance.now() - t0);
        if (!r.ok) { setSummary({ ...sum }); setError(`${r.error} Уже применённые строки сохранены; нажмите «Применить» снова — повтор безопасен.`); return r; }
        after = r.data.nextAfter;
        sum.created += r.data.created; sum.updated += r.data.updated; sum.unchanged += r.data.unchanged; sum.needsReview += r.data.needsReview; sum.errors += r.data.errors; sum.processed += r.data.processed;
        setProgress({ done: sum.processed, total, label: "Применение строк" });
        if (r.data.done) { setSummary({ ...sum }); return { ok: true, message: `Создано ${sum.created}, обновлено ${sum.updated}, без изменений ${sum.unchanged}, требует решения ${sum.needsReview}, ошибок ${sum.errors}.` }; }
      }
      setSummary({ ...sum });
      const stop = { ok: false as const, error: "Применение не завершено за отведённое число шагов. Нажмите «Применить» снова — повтор безопасен." };
      setError(stop.error);
      return stop;
    } finally {
      setBusy(null); setProgress(null);
      await load();
      router.refresh();
    }
  }

  const ready = pv?.ready ?? 0;
  const nothingToDo = pv && pv.ready === 0 && pv.unresolvedUnits === 0 && pv.needsDecision === 0 && pv.errors === 0;

  return (
    <section aria-label="Завершить применение импорта" className="space-y-3 rounded-xl border border-warning/40 bg-card p-4 shadow-xs" data-testid="import-finish-panel">
      <div className="space-y-1 text-sm">
        <p className="font-medium">Завершить применение: строки, пропущенные из-за подразделения</p>
        <p className="text-muted-foreground">
          После применения часть строк была пропущена, потому что подразделения не было в справочнике. Создайте подразделения или закрепите написания в «Подразделения и отделы»,
          затем перепроверьте строки и примените готовые. Применённые ранее строки не затрагиваются; сотрудники создаются только после вашего подтверждения.
        </p>
      </div>

      {!pv && !error && <p className="text-sm text-muted-foreground"><Loader2 className="mr-1 inline size-4 animate-spin" aria-hidden="true" /> Загрузка предпросмотра…</p>}

      {pv && (
        <div className="space-y-2" data-testid="import-finish-preview">
          <dl className="grid grid-cols-2 gap-2 text-sm sm:grid-cols-3 lg:grid-cols-6">
            {([
              ["Готово к применению", pv.ready, "import-finish-ready"],
              ["…будет создано", pv.readyCreate, "import-finish-create"],
              ["…будет обновлено", pv.readyUpdate, "import-finish-update"],
              ["Подразделение не найдено", pv.unresolvedUnits, "import-finish-unresolved"],
              ["Требуют решения", pv.needsDecision, "import-finish-decision"],
              ["Ошибки", pv.errors, "import-finish-errors"],
            ] as const).map(([label, value, tid]) => (
              <div key={tid} className="rounded-lg border p-2">
                <dt className="text-xs text-muted-foreground">{label}</dt>
                <dd className="text-xl font-semibold tabular-nums" data-testid={tid}>{value}</dd>
              </div>
            ))}
          </dl>
          <p className="text-xs text-muted-foreground">
            Применено ранее: {pv.alreadyApplied}. Дозавершено сейчас: {pv.completedNow}. Без отличий: {pv.unchangedAfter}. Пропущено вашим решением: {pv.skippedByDecision}.
          </p>
          {pv.unresolvedNames.length > 0 && (
            <div className="space-y-1 rounded-lg bg-muted/40 p-2 text-sm" data-testid="import-finish-names">
              <p className="font-medium">Нет в справочнике подразделений ({pv.unresolvedNames.length}{pv.unresolvedNames.length >= 20 ? "+" : ""}):</p>
              <ul className="list-disc space-y-0.5 pl-5 text-muted-foreground">
                {pv.unresolvedNames.map((n) => (<li key={`${n.kind}|${n.name}`}>{n.kind === "UNIT" ? "Отдел" : "Подразделение"} «{n.name}» — строк: {n.rows}</li>))}
              </ul>
              <p className="text-xs text-muted-foreground">Создайте их одним списком («Добавить списком») или закрепите написание существующего подразделения, затем нажмите «Перепроверить».</p>
              <Button asChild size="sm" variant="outline"><Link href="/settings/references#units">Открыть «Подразделения и отделы»</Link></Button>
            </div>
          )}
          {pv.sample.length > 0 && (
            <ul className="space-y-0.5 text-xs text-muted-foreground" data-testid="import-finish-sample">
              {pv.sample.map((s) => (
                <li key={s.rowNo}>
                  Строка {s.rowNo}: {s.fullName}{s.employeeCode ? ` (${s.employeeCode})` : ""} — <Badge variant={s.verdict === "CREATE" ? "success" : s.verdict === "UPDATE" ? "brand" : "warning"}>{s.verdict === "CREATE" ? "будет создан" : s.verdict === "UPDATE" ? "будет обновлён" : "нужна проверка"}</Badge>
                </li>
              ))}
              {pv.ready > pv.sample.length && <li>…и ещё {pv.ready - pv.sample.length}. Окончательное сопоставление сотрудника выполняется при применении.</li>}
            </ul>
          )}
        </div>
      )}

      {progress && progress.total > 0 && (
        <div className="space-y-1" role="status" aria-live="polite" data-testid="import-finish-progress">
          <p className="text-sm">{progress.label}: {Math.min(progress.done, progress.total)} из {progress.total}</p>
          <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
            <div className="h-full bg-brand transition-all" style={{ width: `${Math.min(100, Math.round((progress.done / progress.total) * 100))}%` }} />
          </div>
        </div>
      )}
      {reanalyzeNote && <p className="text-sm" data-testid="import-finish-reanalyze-note">{reanalyzeNote}</p>}
      {summary && (
        <p className="rounded-lg border border-success/30 bg-success/10 px-3 py-2 text-sm" data-testid="import-finish-summary">
          Итог: создано {summary.created}, обновлено {summary.updated}, без изменений {summary.unchanged}, требует решения {summary.needsReview}, ошибок {summary.errors}.
        </p>
      )}
      <FormAlert error={error} />
      {nothingToDo && <p className="text-sm text-muted-foreground" data-testid="import-finish-done">Все строки обработаны: ожидающих нет.</p>}

      <div className="flex flex-col gap-2 sm:flex-row">
        <Button type="button" variant="outline" onClick={reanalyze} disabled={busy !== null || !pv || pv.unresolvedUnits === 0} data-testid="import-finish-reanalyze">
          {busy === "reanalyze" ? <Loader2 className="animate-spin" aria-hidden="true" /> : <RefreshCw aria-hidden="true" />} Перепроверить подразделения{pv && pv.unresolvedUnits > 0 ? ` (${pv.unresolvedUnits})` : ""}
        </Button>
        <Button type="button" onClick={() => setDlg(true)} disabled={busy !== null || ready === 0} data-testid="import-finish-apply">
          {busy === "apply" ? <Loader2 className="animate-spin" aria-hidden="true" /> : <Check aria-hidden="true" />} Применить готовые{ready > 0 ? ` (${ready})` : ""}
        </Button>
      </div>

      <ReasonDialog
        open={dlg}
        title="Применить разрешённые строки"
        description={`Будет обработано строк: ${ready} (создать ${pv?.readyCreate ?? 0}, обновить ${pv?.readyUpdate ?? 0}). Перед записью каждый сотрудник сопоставляется заново: уже существующий обновится, а не продублируется; неоднозначные строки не применяются и остаются на проверке. Нерешённые подразделения (${pv?.unresolvedUnits ?? 0}) и строки с вашим решением не затрагиваются.`}
        confirmLabel="Применить"
        onClose={() => setDlg(false)}
        onConfirm={(reason) => apply(reason)}
        onDone={() => router.refresh()}
        testId="import-finish-dialog"
      />
    </section>
  );
}
