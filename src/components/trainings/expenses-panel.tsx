"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Ban, Loader2, Lock, Pencil, Plus } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Field, FormAlert } from "@/components/auth/form-parts";
import { EmptyState } from "@/components/common/states";
import { ReasonDialog } from "@/components/workflow/reason-dialog";
import { useToast } from "@/components/workflow/toast";
import { addExpense, updateExpense, voidExpense } from "@/app/(app)/trainings/actions";
import { formatDate, formatMoney } from "@/lib/format";
import { CURRENCIES } from "@/lib/workflows/schemas";

export type ExpenseRow = {
  id: string;
  category_id: number;
  category: string;
  amount: number;
  currency: string;
  operation_date: string;
  fx_rate: number | null;
  amount_tjs: number | null;
  comment: string | null;
  voided_at: string | null;
  void_reason: string | null;
};
export type CategoryOption = { id: number; name: string };

/**
 * Расходы тренинга. Оригинальная сумма и валюта хранятся как введены; TJS и курс считает база (исторический USD остаётся USD).
 * Создавать и править: ADMIN, ACADEMY_MANAGER, FINANCE. Сторно: ADMIN, FINANCE. Любая денежная правка требует причину.
 * Роли без доступа к деньгам (HR) видят только пометку «ограничено».
 */
export function ExpensesPanel({ trainingId, expenses, categories, financialAccess, canEdit, canVoid, archived, totalTjs, perParticipant }: { trainingId: string; expenses: ExpenseRow[]; categories: CategoryOption[]; financialAccess: boolean; canEdit: boolean; canVoid: boolean; archived: boolean; totalTjs: number | null; perParticipant: number | null }) {
  const router = useRouter();
  const { notify } = useToast();
  const [editing, setEditing] = useState<ExpenseRow | "new" | null>(null);
  const [voiding, setVoiding] = useState<ExpenseRow | null>(null);
  const [error, setError] = useState<string | undefined>();
  const [fieldErrors, setFieldErrors] = useState<Record<string, string | undefined>>({});
  const [pending, startTransition] = useTransition();
  const current = editing && editing !== "new" ? editing : null;
  const editable = canEdit && !archived;

  if (!financialAccess) {
    return <EmptyState className="bg-card" icon={Lock} title="Финансовые данные недоступны" description="Ваша роль не предусматривает просмотр расходов. Суммы не заменяются нулём: они просто скрыты." />;
  }

  function submit(form: HTMLFormElement) {
    const fd = new FormData(form);
    setError(undefined);
    setFieldErrors({});
    const values = { category_id: fd.get("category_id"), amount: String(fd.get("amount") ?? "").replace(",", "."), currency: fd.get("currency"), operation_date: fd.get("operation_date"), comment: fd.get("comment") };
    const reason = String(fd.get("reason") ?? "");
    startTransition(async () => {
      const result = current ? await updateExpense({ id: current.id, trainingId, values, reason }) : await addExpense({ trainingId, values, reason });
      if (result.ok) {
        notify(true, result.message ?? "Сохранено.");
        setEditing(null);
        router.refresh();
      } else {
        setError(result.error);
        setFieldErrors(result.fieldErrors ?? {});
      }
    });
  }

  const active = expenses.filter((e) => !e.voided_at);
  return (
    <div className="space-y-3" data-testid="expenses-panel">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm">
          Факт: <strong data-testid="expenses-total">{formatMoney(totalTjs)}</strong>
          {perParticipant !== null && <span className="text-muted-foreground"> · на участника: {formatMoney(perParticipant)}</span>}
        </p>
        {editable && (
          <Button size="sm" onClick={() => { setError(undefined); setFieldErrors({}); setEditing("new"); }} data-testid="add-expense">
            <Plus aria-hidden="true" /> Добавить расход
          </Button>
        )}
      </div>
      <p className="text-xs text-muted-foreground">Суммы расходов не меняются автоматически при изменении числа участников. Исправление — только с причиной, ошибочную операцию можно сторнировать.</p>
      {expenses.length === 0 ? (
        <EmptyState className="bg-card" compact title="Расходов пока нет" />
      ) : (
        <ul className="divide-y rounded-xl border bg-card shadow-xs">
          {expenses.map((e) => (
            <li key={e.id} className={"flex flex-wrap items-start justify-between gap-2 px-3 py-2.5 text-sm" + (e.voided_at ? " opacity-60" : "")} data-testid="expense-row">
              <div className="min-w-0">
                <p className="font-medium">
                  {e.category}: <span className={e.voided_at ? "line-through" : ""}>{formatMoney(e.amount, e.currency)}</span>
                  {e.voided_at && <Badge variant="outline" className="ml-2">Сторно</Badge>}
                </p>
                <p className="text-xs text-muted-foreground">
                  {formatDate(e.operation_date)}
                  {e.currency !== "TJS" && e.fx_rate !== null && ` · курс ${e.fx_rate} → ${formatMoney(e.amount_tjs)}`}
                  {e.comment ? ` · ${e.comment}` : ""}
                  {e.void_reason ? ` · причина сторно: ${e.void_reason}` : ""}
                </p>
              </div>
              {!e.voided_at && (
                <div className="flex gap-1">
                  {editable && (
                    <Button size="icon" variant="ghost" aria-label={`Изменить расход ${e.category}`} onClick={() => { setError(undefined); setFieldErrors({}); setEditing(e); }}>
                      <Pencil aria-hidden="true" />
                    </Button>
                  )}
                  {canVoid && !archived && (
                    <Button size="icon" variant="ghost" aria-label={`Сторнировать расход ${e.category}`} onClick={() => setVoiding(e)}>
                      <Ban aria-hidden="true" />
                    </Button>
                  )}
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
      {active.length !== expenses.length && <p className="text-xs text-muted-foreground">В факт не входят сторнированные операции.</p>}

      <Dialog open={editing !== null} onOpenChange={(o) => !o && !pending && setEditing(null)}>
        <DialogContent data-testid="expense-dialog">
          <DialogHeader>
            <DialogTitle>{current ? "Изменить расход" : "Новый расход"}</DialogTitle>
            <DialogDescription>Валюта кроме TJS пересчитывается по курсу на дату операции. Нет курса — сохранение отклоняется, подмены на 1 не будет.</DialogDescription>
          </DialogHeader>
          {editing && (
            <form key={current?.id ?? "new"} className="grid gap-4" onSubmit={(e) => { e.preventDefault(); submit(e.currentTarget); }} noValidate>
              <FormAlert error={error} />
              <div className="grid gap-2">
                <Label htmlFor="category_id">Статья</Label>
                <Select id="category_id" name="category_id" defaultValue={current ? String(current.category_id) : ""} disabled={pending} aria-invalid={fieldErrors.category_id ? true : undefined}>
                  <option value="">— выберите —</option>
                  {categories.map((c) => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </Select>
                {fieldErrors.category_id && <p className="text-xs text-destructive">{fieldErrors.category_id}</p>}
              </div>
              <div className="grid gap-4 sm:grid-cols-3">
                <Field id="amount" label="Сумма *" inputMode="decimal" defaultValue={current ? String(current.amount) : ""} error={fieldErrors.amount} disabled={pending} />
                <div className="grid gap-2">
                  <Label htmlFor="currency">Валюта</Label>
                  <Select id="currency" name="currency" defaultValue={current?.currency ?? "TJS"} disabled={pending}>
                    {CURRENCIES.map((c) => (
                      <option key={c} value={c}>{c}</option>
                    ))}
                  </Select>
                </div>
                <Field id="operation_date" label="Дата *" type="date" defaultValue={current?.operation_date ?? ""} error={fieldErrors.operation_date} disabled={pending} />
              </div>
              <Field id="comment" label="Комментарий" defaultValue={current?.comment ?? ""} disabled={pending} />
              <Field id="reason" label="Причина / основание *" error={fieldErrors.reason} disabled={pending} hint="Номер счёта, договор, причина правки — сохраняется в журнале" />
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setEditing(null)} disabled={pending}>Отмена</Button>
                <Button type="submit" disabled={pending}>
                  {pending && <Loader2 className="animate-spin" aria-hidden="true" />} Сохранить
                </Button>
              </DialogFooter>
            </form>
          )}
        </DialogContent>
      </Dialog>

      <ReasonDialog
        open={voiding !== null}
        title="Сторнировать расход"
        description="Операция останется в журнале, но перестанет входить в факт. Отменить сторно нельзя: при ошибке добавьте верную операцию."
        confirmLabel="Сторнировать"
        destructive
        testId="void-expense-dialog"
        onClose={() => setVoiding(null)}
        onConfirm={(reason) => voidExpense({ id: voiding?.id ?? "", trainingId, reason })}
        onDone={() => router.refresh()}
      />
    </div>
  );
}
