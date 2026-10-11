"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Check, CircleSlash, Loader2, UserPlus, Undo2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { FormAlert } from "@/components/auth/form-parts";
import { ReasonDialog } from "@/components/workflow/reason-dialog";
import { useToast } from "@/components/workflow/toast";
import { getDecisionsSummary, type DecisionsSummary } from "@/app/(app)/imports/decisions-actions";
import { safeAction } from "@/lib/imports/batch";
import { runApplyDecisions, runBulkDecision } from "@/lib/imports/decisions-run";

/**
 * Сотрудники, которых система не добавила сама («совпадение неточное»). После применения задания их можно решить прямо здесь:
 * на каждой карточке — «Создать нового», «Сопоставить» или «Пропустить», а здесь — то же для всех сразу и кнопка «Применить решения».
 * Решение само по себе ничего не записывает в справочник сотрудников; запись происходит только по кнопке «Применить» и после указания причины.
 */
export function ImportDecisionsPanel({ jobId, initial }: { jobId: string; initial: DecisionsSummary | null }) {
  const router = useRouter();
  const { notify } = useToast();
  // Сводка приходит с сервера (initial) и обновляется после router.refresh() — например, после решения на карточке.
  // Свежий ответ самой панели действует, пока сервер не прислал новую сводку.
  const [fresh, setFresh] = useState<{ base: DecisionsSummary | null; value: DecisionsSummary } | null>(null);
  const sm = fresh && fresh.base === initial ? fresh.value : initial;
  const [busy, setBusy] = useState<"bulk" | "apply" | null>(null);
  const [error, setError] = useState<string | undefined>(initial ? undefined : "Не удалось загрузить сводку. Обновите страницу.");
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [result, setResult] = useState<string | undefined>();
  const [dlg, setDlg] = useState(false);

  async function reload() {
    const r = await safeAction(() => getDecisionsSummary({ jobId }));
    if (r.ok) setFresh({ base: initial, value: r.data });
    router.refresh();
  }

  async function bulk(decision: "APPLY" | "SKIP" | "CLEAR") {
    if (!sm) return;
    setBusy("bulk"); setError(undefined); setResult(undefined);
    try {
      const r = await runBulkDecision(jobId, decision);
      if (!r.ok) { setError(r.error); return; }
      notify(true, decision === "CLEAR" ? "Решения сняты." : "Решения сохранены. Сотрудники пока не добавлены: нажмите «Применить решения».");
    } finally {
      setBusy(null);
      await reload();
    }
  }

  async function apply(reasonText: string): Promise<{ ok: true; message?: string } | { ok: false; error: string }> {
    if (!sm) return { ok: false, error: "Нет данных." };
    setBusy("apply"); setError(undefined); setResult(undefined);
    const total = sm.toCreate + sm.toMatch;
    try {
      const r = await runApplyDecisions(jobId, reasonText, total, (done, t) => setProgress({ done, total: Math.max(t, done) }));
      const t = r.totals;
      const text = `Создано ${t.created}, обновлено ${t.updated}${t.errors ? `, не удалось применить ${t.errors}` : ""}.`;
      setResult(text);
      if (!r.ok) { setError(`${r.error} Уже применённые строки сохранены; нажмите «Применить решения» снова — повтор безопасен.`); return r; }
      return { ok: true, message: text };
    } finally {
      setBusy(null); setProgress(null);
      await reload();
    }
  }

  if (!sm || (sm.total === 0 && !error)) return null;

  const ready = sm.toCreate + sm.toMatch;
  const decided = ready + sm.toSkip;

  return (
    <section aria-label="Сотрудники, требующие решения" className="space-y-4 rounded-xl border border-brand/40 bg-card p-4 shadow-xs" data-testid="import-decisions-panel">
      <div className="space-y-1">
        <h2 className="text-base font-semibold">Сотрудники, которых нужно проверить: {sm.total}</h2>
        <p className="text-sm text-muted-foreground">
          Система нашла в базе человека с похожим ФИО и не стала решать за вас. Для каждой строки выберите на карточке ниже: <strong className="font-medium text-foreground">создать нового</strong>, <strong className="font-medium text-foreground">сопоставить</strong> с тем, кто уже есть, или <strong className="font-medium text-foreground">пропустить</strong>. Сотрудники появятся в базе только после кнопки «Применить решения».
        </p>
      </div>

      <dl className="grid grid-cols-2 gap-2 text-sm sm:grid-cols-5" data-testid="import-decisions-counts">
        {([
          ["Без решения", sm.undecided, "undecided"],
          ["Создать нового", sm.toCreate, "create"],
          ["Сопоставить", sm.toMatch, "match"],
          ["Пропустить", sm.toSkip, "skip"],
          ["Не удалось применить", sm.errors, "errors"],
        ] as const).map(([label, value, key]) => (
          <div key={key} className={`rounded-lg border p-2 ${key === "errors" && value > 0 ? "border-destructive/40" : ""}`}>
            <dt className="text-xs text-muted-foreground">{label}</dt>
            <dd className="text-xl font-semibold tabular-nums" data-testid={`import-decisions-${key}`}>{value}</dd>
          </div>
        ))}
      </dl>

      {progress && progress.total > 0 && (
        <div className="space-y-1" role="status" aria-live="polite" data-testid="import-decisions-progress">
          <p className="text-sm">Применение решений: {Math.min(progress.done, progress.total)} из {progress.total}</p>
          <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
            <div className="h-full bg-brand transition-all" style={{ width: `${Math.min(100, Math.round((progress.done / progress.total) * 100))}%` }} />
          </div>
        </div>
      )}
      {result && <p className="rounded-lg border border-success/30 bg-success/10 px-3 py-2 text-sm" data-testid="import-decisions-result">{result}</p>}
      <FormAlert error={error} />

      <div className="space-y-2">
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Для всех, у кого ещё нет решения</p>
        <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
          <Button type="button" variant="outline" className="min-h-10" disabled={busy !== null || sm.undecided === 0} onClick={() => bulk("APPLY")} data-testid="import-decisions-all-create">
            {busy === "bulk" ? <Loader2 className="animate-spin" aria-hidden="true" /> : <UserPlus aria-hidden="true" />} Создать всех как новых{sm.undecided > 0 ? ` (${sm.undecided})` : ""}
          </Button>
          <Button type="button" variant="outline" className="min-h-10" disabled={busy !== null || sm.undecided === 0} onClick={() => bulk("SKIP")} data-testid="import-decisions-all-skip">
            <CircleSlash aria-hidden="true" /> Пропустить всех{sm.undecided > 0 ? ` (${sm.undecided})` : ""}
          </Button>
          <Button type="button" variant="ghost" className="min-h-10" disabled={busy !== null || decided === 0} onClick={() => bulk("CLEAR")} data-testid="import-decisions-clear">
            <Undo2 aria-hidden="true" /> Снять все решения{decided > 0 ? ` (${decided})` : ""}
          </Button>
        </div>
        <p className="text-xs text-muted-foreground">Чтобы «сопоставить» с существующим сотрудником, нажмите нужное имя на карточке: массово это сделать нельзя, потому что для каждого человека выбор свой.</p>
      </div>

      <div className="flex flex-col gap-2 border-t pt-3 sm:flex-row sm:items-center">
        <Button type="button" className="min-h-10" disabled={busy !== null || ready === 0} onClick={() => setDlg(true)} data-testid="import-decisions-apply">
          {busy === "apply" ? <Loader2 className="animate-spin" aria-hidden="true" /> : <Check aria-hidden="true" />} Применить решения{ready > 0 ? ` (${ready})` : ""}
        </Button>
        <p className="text-xs text-muted-foreground">{ready === 0 ? "Выберите «создать» или «сопоставить» хотя бы для одной строки." : `Будет создано сотрудников: ${sm.toCreate}, обновлено: ${sm.toMatch}. Пропущенные строки не затрагиваются.`}</p>
      </div>

      <ReasonDialog
        open={dlg}
        title="Применить решения по сотрудникам"
        description={`Будет создано сотрудников: ${sm.toCreate}, обновлено существующих: ${sm.toMatch}. Если сотрудник с таким ФИО или табельным номером уже есть, «создать» не сработает, чтобы не появился дубль: такая строка останется в списке, и для неё нужно выбрать «Сопоставить». Пропущенные строки и строки без решения не затрагиваются.`}
        confirmLabel="Применить"
        onClose={() => setDlg(false)}
        onConfirm={(reasonText) => apply(reasonText)}
        onDone={() => router.refresh()}
        testId="import-decisions-dialog"
      />
    </section>
  );
}
