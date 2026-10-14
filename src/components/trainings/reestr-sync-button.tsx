"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { FormAlert } from "@/components/auth/form-parts";
import { syncReestr, type ReestrSyncReport } from "@/app/(app)/trainings/reestr-sync-actions";

/** Кнопка «Синхронизировать сейчас»: подтягивает новое из Google-таблицы Реестра и показывает итог. Существующие данные не перезаписываются. */
export function ReestrSyncButton() {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [open, setOpen] = useState(false);
  const [report, setReport] = useState<ReestrSyncReport | null>(null);
  const [error, setError] = useState<string | null>(null);

  const run = () => {
    setError(null);
    setReport(null);
    setOpen(true);
    start(async () => {
      const res = await syncReestr();
      if (res.ok) {
        setReport(res.data);
        router.refresh();
      } else setError(res.error);
    });
  };

  const nothing = report && report.new_trainings.length + report.added_participants + report.added_expenses === 0;

  return (
    <>
      <Button variant="outline" size="sm" onClick={run} disabled={pending} data-testid="reestr-sync">
        {pending ? <Loader2 className="animate-spin" /> : <RefreshCw />} Синхронизировать сейчас
      </Button>
      <Dialog open={open} onOpenChange={(o) => !pending && setOpen(o)}>
        <DialogContent className="max-w-lg" data-testid="reestr-sync-dialog">
          <DialogHeader>
            <DialogTitle>Синхронизация с Реестром обучения</DialogTitle>
            <DialogDescription>Новое из Google-таблицы добавляется, существующие записи не меняются и ничего не удаляется.</DialogDescription>
          </DialogHeader>
          {pending ? (
            <p className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="size-4 animate-spin" /> Читаю таблицу…
            </p>
          ) : null}
          {error ? <FormAlert error={error} /> : null}
          {report ? (
            <div className="space-y-3 text-sm" data-testid="reestr-sync-report">
              {nothing ? <p>Новых данных нет: TMS совпадает с таблицей.</p> : null}
              <ul className="space-y-1">
                <li>Новых тренингов: <b>{report.new_trainings.length}</b></li>
                <li>Добавлено участников: <b>{report.added_participants}</b> (новых внешних карточек: {report.created_external})</li>
                <li>Добавлено расходов: <b>{report.added_expenses}</b></li>
                <li>Новых тренеров: <b>{report.new_trainers}</b></li>
              </ul>
              {report.new_trainings.length > 0 ? <p className="text-muted-foreground">Добавлены: {report.new_trainings.map((t) => `${t.code} ${t.title}`).join("; ")}</p> : null}
              {report.ambiguous.length > 0 ? (
                <div>
                  <p className="font-medium">Не добавлены — несколько похожих сотрудников ({report.ambiguous.length}):</p>
                  <ul className="list-disc pl-5 text-muted-foreground">
                    {report.ambiguous.slice(0, 20).map((a, i) => (
                      <li key={i}>№{a.training}: {a.name} ({a.candidates} совпад.)</li>
                    ))}
                  </ul>
                  <p className="text-xs text-muted-foreground">Добавьте этих людей вручную в списке участников или уточните ФИО в таблице.</p>
                </div>
              ) : null}
              {report.changed.length > 0 ? (
                <div>
                  <p className="font-medium">Расхождения с таблицей (в TMS не менялись, {report.changed.length}):</p>
                  <ul className="list-disc pl-5 text-muted-foreground">
                    {report.changed.slice(0, 20).map((c, i) => (
                      <li key={i}>№{c.id}, {c.field}: в таблице «{c.sheet}», в TMS «{c.tms}»</li>
                    ))}
                  </ul>
                </div>
              ) : null}
              {report.warnings.length > 0 ? (
                <ul className="list-disc pl-5 text-muted-foreground">
                  {report.warnings.map((w, i) => (
                    <li key={i}>№{w.id}: {w.text}</li>
                  ))}
                </ul>
              ) : null}
            </div>
          ) : null}
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)} disabled={pending}>Закрыть</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
