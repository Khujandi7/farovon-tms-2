"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Check, Loader2, Play, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { FormAlert } from "@/components/auth/form-parts";
import { ReasonDialog } from "@/components/workflow/reason-dialog";
import { useToast } from "@/components/workflow/toast";
import { cancelImport, commitImportStep, type CommitStep } from "@/app/(app)/imports/actions";
import { safeAction } from "@/lib/imports/batch";

type Progress = { processed: number; total: number };
const MAX_STEPS = 500; // предохранитель: 5000 строк / 120 в пакете ≈ 42 пакета, вызов — несколько пакетов

/**
 * Применить / отменить импорт. Сотрудники применяются пакетами: каждый вызов сервера обрабатывает несколько пакетов
 * в пределах бюджета времени и возвращает прогресс; цикл повторяет вызов до завершения. Уже применённые строки
 * при повторе не применяются снова, поэтому после ошибки или перезагрузки страницы применение можно продолжить.
 */
export function ImportJobActions({ jobId, unresolved, totalApply, status = "STAGED", processed = 0, total = 0 }: { jobId: string; unresolved: number; totalApply: number; status?: string; processed?: number; total?: number }) {
  const router = useRouter();
  const { notify } = useToast();
  const [dlg, setDlg] = useState<"commit" | "cancel" | null>(null);
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState<Progress | null>(status === "COMMITTING" ? { processed, total } : null);
  const [error, setError] = useState<string | undefined>();
  const committing = status === "COMMITTING";

  /** Крутит шаги применения до done. Возвращает результат последнего шага (для диалога причины). */
  async function run(reason: string | null): Promise<{ ok: true; message?: string; data: CommitStep } | { ok: false; error: string }> {
    setRunning(true);
    setError(undefined);
    let first = true;
    let limit: number | null = null; // адаптивный размер пакета переносится между шагами
    try {
      for (let i = 0; i < MAX_STEPS; i++) {
        const r = await safeAction(() => commitImportStep({ jobId, reason: first ? reason : null, limit }));
        first = false;
        if (!r.ok) {
          setError(r.error);
          router.refresh();
          return r;
        }
        setProgress({ processed: r.data.total - r.data.remaining, total: r.data.total });
        limit = r.data.limit || null;
        if (r.data.done) {
          router.refresh();
          return r;
        }
      }
      const stop = { ok: false as const, error: "Применение не завершено за отведённое число шагов. Нажмите «Продолжить» — повтор безопасен." };
      setError(stop.error);
      router.refresh();
      return stop;
    } finally {
      setRunning(false);
    }
  }

  async function resume() {
    const r = await run(null);
    if (r.ok) notify(true, r.message ?? "Импорт применён.");
  }

  const bar = progress && progress.total > 0 && (
    <div className="space-y-1" role="status" aria-live="polite" data-testid="import-commit-progress">
      <p className="text-sm">Обработано строк: {progress.processed} из {progress.total}</p>
      <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
        <div className="h-full bg-brand transition-all" style={{ width: `${Math.min(100, Math.round((progress.processed / progress.total) * 100))}%` }} />
      </div>
    </div>
  );

  if (committing) {
    return (
      <section aria-label="Применение импорта" className="space-y-3 rounded-xl border bg-card p-4 shadow-xs" data-testid="import-commit-resume">
        <div className="space-y-1 text-sm">
          <p className="font-medium">Применение не завершено.</p>
          <p className="text-muted-foreground">Уже применённые строки сохранены и повторно не применяются. Продолжите, чтобы обработать остальные.</p>
        </div>
        {bar}
        <FormAlert error={error} />
        <Button type="button" onClick={resume} disabled={running} data-testid="import-commit-continue">
          {running ? <Loader2 className="animate-spin" aria-hidden="true" /> : <Play aria-hidden="true" />} Продолжить применение
        </Button>
      </section>
    );
  }

  return (
    <section aria-label="Применение импорта" className="space-y-3 rounded-xl border bg-card p-4 shadow-xs">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="space-y-1 text-sm">
          <p className="font-medium">Dry run выполнен: данные пока не изменены.</p>
          <p className="text-muted-foreground">
            К применению: новых и обновляемых строк — {totalApply}.
            {unresolved > 0 ? ` Строк без решения: ${unresolved} — они будут пропущены.` : " Все спорные строки решены."}
          </p>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row">
          <Button type="button" variant="outline" onClick={() => setDlg("cancel")} disabled={running} data-testid="import-cancel"><X aria-hidden="true" /> Отменить импорт</Button>
          <Button type="button" onClick={() => setDlg("commit")} disabled={running} data-testid="import-commit"><Check aria-hidden="true" /> Применить</Button>
        </div>
      </div>
      {bar}
      <FormAlert error={error} />
      <ReasonDialog
        open={dlg === "commit"}
        title="Применить импорт"
        description={`${unresolved > 0 ? `Строки без решения (${unresolved}) будут пропущены. ` : ""}Сотрудники применяются пакетами: каждый пакет сохраняется сразу. При сбое уже применённые строки остаются, и применение можно продолжить без дублей.`}
        confirmLabel="Применить"
        onClose={() => setDlg(null)}
        onConfirm={(reason) => run(reason)}
        onDone={() => router.refresh()}
        testId="import-commit-dialog"
      />
      <ReasonDialog
        open={dlg === "cancel"}
        title="Отменить импорт"
        description="Данные справочников не изменятся. Задача останется в истории со статусом «Отменён»."
        confirmLabel="Отменить импорт"
        destructive
        onClose={() => setDlg(null)}
        onConfirm={(reason) => cancelImport({ jobId, reason })}
        onDone={() => router.refresh()}
        testId="import-cancel-dialog"
      />
    </section>
  );
}
