"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Check, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ReasonDialog } from "@/components/workflow/reason-dialog";
import { cancelImport, commitImport } from "@/app/(app)/imports/actions";

/** Применить / отменить импорт (оба действия с причиной; нерешённые строки при применении пропускаются). */
export function ImportJobActions({ jobId, unresolved, totalApply }: { jobId: string; unresolved: number; totalApply: number }) {
  const router = useRouter();
  const [dlg, setDlg] = useState<"commit" | "cancel" | null>(null);
  return (
    <section aria-label="Применение импорта" className="flex flex-col gap-3 rounded-xl border bg-card p-4 shadow-xs sm:flex-row sm:items-center sm:justify-between">
      <div className="space-y-1 text-sm">
        <p className="font-medium">Dry run выполнен: данные пока не изменены.</p>
        <p className="text-muted-foreground">
          К применению: новых и обновляемых строк — {totalApply}.
          {unresolved > 0 ? ` Строк без решения: ${unresolved} — они будут пропущены.` : " Все спорные строки решены."}
        </p>
      </div>
      <div className="flex flex-col gap-2 sm:flex-row">
        <Button type="button" variant="outline" onClick={() => setDlg("cancel")} data-testid="import-cancel"><X aria-hidden="true" /> Отменить импорт</Button>
        <Button type="button" onClick={() => setDlg("commit")} data-testid="import-commit"><Check aria-hidden="true" /> Применить</Button>
      </div>
      <ReasonDialog
        open={dlg === "commit"}
        title="Применить импорт"
        description={unresolved > 0 ? `Строки без решения (${unresolved}) будут пропущены. Всё применяется одной транзакцией: при ошибке данные не изменятся.` : "Всё применяется одной транзакцией: при ошибке данные не изменятся."}
        confirmLabel="Применить"
        onClose={() => setDlg(null)}
        onConfirm={(reason) => commitImport({ jobId, reason })}
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
