"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Ban, Calculator, ClipboardCheck, Loader2, Pencil, Wallet } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { FormAlert } from "@/components/auth/form-parts";
import { ReasonDialog } from "@/components/workflow/reason-dialog";
import { useToast } from "@/components/workflow/toast";
import { cancelAgreement, evaluateAgreement, recordRepayment, reviewObligation, updateAgreement } from "@/app/(app)/funding/actions";
import { formatMoney } from "@/lib/format";
import { validateRepayment } from "@/lib/funding/calc";
import type { AgreementActions } from "@/lib/funding/status";
import { LegalWarning } from "./legal-warning";

type Outcome = { ok: true; message?: string } | { ok: false; error: string };
const toOutcome = (r: { ok: true; message?: string } | { ok: false; error: string }): Outcome => (r.ok ? { ok: true, message: r.message } : { ok: false, error: r.error });
const btn = "min-h-10";

export type ContractDocOption = { id: string; title: string };
export type AgreementEditDefaults = { contract_number: string | null; contract_date: string | null; contract_document_id: string | null; conditions: string | null; pass_condition: string | null; fail_condition: string | null; note: string | null };

export function AgreementActionsBar({
  id,
  actions,
  currency,
  outstanding,
  contractDocs,
  defaults,
  hasObligation,
}: {
  id: string;
  actions: AgreementActions;
  currency: string;
  outstanding: number;
  contractDocs: ContractDocOption[];
  defaults: AgreementEditDefaults;
  hasObligation: boolean;
}) {
  const router = useRouter();
  const [dialog, setDialog] = useState<null | "evaluate" | "review" | "repay" | "cancel" | "edit">(null);
  const [reviewNote, setReviewNote] = useState("");
  const close = () => setDialog(null);
  const done = () => router.refresh();

  return (
    <div className="space-y-3" data-testid="agreement-actions">
      <div className="flex flex-wrap gap-2">
        {actions.evaluate && (
          <Button className={btn} onClick={() => setDialog("evaluate")} data-testid="evaluate-agreement">
            <Calculator aria-hidden="true" /> {hasObligation ? "Пересчитать" : "Рассчитать обязательство"}
          </Button>
        )}
        {actions.review && (
          <Button className={btn} variant="outline" onClick={() => setDialog("review")} data-testid="review-obligation">
            <ClipboardCheck aria-hidden="true" /> Проверить обязательство
          </Button>
        )}
        {actions.record && (
          <Button className={btn} variant="outline" onClick={() => setDialog("repay")} data-testid="record-repayment">
            <Wallet aria-hidden="true" /> Внести погашение
          </Button>
        )}
        {actions.edit && (
          <Button className={btn} variant="outline" onClick={() => setDialog("edit")} data-testid="edit-agreement">
            <Pencil aria-hidden="true" /> Изменить договор и условия
          </Button>
        )}
        {actions.cancel && (
          <Button className={btn} variant="ghost" onClick={() => setDialog("cancel")} data-testid="cancel-agreement">
            <Ban aria-hidden="true" /> Отменить соглашение
          </Button>
        )}
      </div>

      <ReasonDialog
        open={dialog === "evaluate"}
        title="Рассчитать обязательство"
        description="Расчёт по подтверждённой политике, действующей на дату расходов, и по результату обучения или экзамена. Деньги не списываются."
        confirmLabel="Рассчитать"
        reasonRequired={false}
        testId="evaluate-dialog"
        onClose={close}
        onConfirm={(reason) => evaluateAgreement({ id, reason }).then(toOutcome)}
        onDone={done}
      >
        <LegalWarning />
      </ReasonDialog>

      <ReasonDialog
        open={dialog === "review"}
        title="Проверка обязательства"
        description="Подтвердите, что расчёт проверен ответственным сотрудником. После этого можно вносить погашения."
        confirmLabel="Подтвердить проверку"
        testId="review-dialog"
        onClose={() => {
          close();
          setReviewNote("");
        }}
        onConfirm={(reason) => reviewObligation({ id, note: reviewNote, reason }).then(toOutcome)}
        onDone={() => {
          setReviewNote("");
          done();
        }}
      >
        <LegalWarning />
        <div className="grid gap-2">
          <Label htmlFor="review-note">Заметка проверки (необязательно)</Label>
          <Textarea id="review-note" value={reviewNote} onChange={(e) => setReviewNote(e.target.value)} rows={2} />
        </div>
      </ReasonDialog>

      <ReasonDialog
        open={dialog === "cancel"}
        title="Отменить соглашение"
        description="Отмена необратима. Если есть погашения, сначала аннулируйте их."
        confirmLabel="Отменить соглашение"
        destructive
        testId="cancel-dialog"
        onClose={close}
        onConfirm={(reason) => cancelAgreement({ id, reason }).then(toOutcome)}
        onDone={done}
      />

      {dialog === "repay" && <RepaymentDialog id={id} currency={currency} outstanding={outstanding} onClose={close} onDone={done} />}
      {dialog === "edit" && <EditDialog id={id} contractDocs={contractDocs} defaults={defaults} onClose={close} onDone={done} />}
    </div>
  );
}

function RepaymentDialog({ id, currency, outstanding, onClose, onDone }: { id: string; currency: string; outstanding: number; onClose: () => void; onDone: () => void }) {
  const { notify } = useToast();
  const [error, setError] = useState<string | undefined>();
  const [fe, setFe] = useState<Record<string, string | undefined>>({});
  const [pending, startTransition] = useTransition();
  const today = new Date().toISOString().slice(0, 10);

  function submit(form: HTMLFormElement) {
    const fd = new FormData(form);
    const amount = Number(String(fd.get("amount") ?? "").replace(",", "."));
    setError(undefined);
    setFe({});
    const local = validateRepayment(amount, outstanding);
    if (local) {
      setFe({ amount: local });
      return;
    }
    startTransition(async () => {
      const r = await recordRepayment({ agreementId: id, amount, paid_on: fd.get("paid_on"), comment: fd.get("comment") });
      if (r.ok) {
        notify(true, r.message ?? "Готово.");
        onClose();
        onDone();
      } else {
        setError(r.error);
        setFe(r.fieldErrors ?? {});
      }
    });
  }

  return (
    <Dialog open onOpenChange={(o) => !o && !pending && onClose()}>
      <DialogContent data-testid="repayment-dialog">
        <DialogHeader>
          <DialogTitle>Внести погашение</DialogTitle>
          <DialogDescription>Только факт оплаты сотрудником. Остаток: {formatMoney(outstanding, currency)}. Удержание из зарплаты система не выполняет.</DialogDescription>
        </DialogHeader>
        <form className="grid gap-4" onSubmit={(e) => { e.preventDefault(); submit(e.currentTarget); }}>
          <FormAlert error={error} />
          <div className="grid gap-2">
            <Label htmlFor="rp-amount">Сумма, {currency}</Label>
            <Input id="rp-amount" name="amount" inputMode="decimal" className="h-10" disabled={pending} aria-invalid={fe.amount ? true : undefined} required />
            {fe.amount && <p className="text-xs text-destructive">{fe.amount}</p>}
          </div>
          <div className="grid gap-2">
            <Label htmlFor="rp-date">Дата платежа</Label>
            <Input id="rp-date" name="paid_on" type="date" defaultValue={today} max={today} className="h-10" disabled={pending} required />
            {fe.paid_on && <p className="text-xs text-destructive">{fe.paid_on}</p>}
          </div>
          <div className="grid gap-2">
            <Label htmlFor="rp-comment">Комментарий (необязательно)</Label>
            <Textarea id="rp-comment" name="comment" rows={2} disabled={pending} />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" className={btn} onClick={onClose} disabled={pending}>Отмена</Button>
            <Button type="submit" className={btn} disabled={pending} data-testid="repayment-submit">
              {pending && <Loader2 className="animate-spin" aria-hidden="true" />} Записать погашение
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function EditDialog({ id, contractDocs, defaults, onClose, onDone }: { id: string; contractDocs: ContractDocOption[]; defaults: AgreementEditDefaults; onClose: () => void; onDone: () => void }) {
  const { notify } = useToast();
  const [error, setError] = useState<string | undefined>();
  const [fe, setFe] = useState<Record<string, string | undefined>>({});
  const [pending, startTransition] = useTransition();

  function submit(form: HTMLFormElement) {
    const fd = new FormData(form);
    setError(undefined);
    setFe({});
    const patch = {
      contract_number: fd.get("contract_number"),
      contract_date: fd.get("contract_date"),
      contract_document_id: fd.get("contract_document_id"),
      conditions: fd.get("conditions"),
      pass_condition: fd.get("pass_condition"),
      fail_condition: fd.get("fail_condition"),
      note: fd.get("note"),
    };
    startTransition(async () => {
      const r = await updateAgreement({ id, patch, reason: String(fd.get("reason") ?? "") });
      if (r.ok) {
        notify(true, r.message ?? "Сохранено.");
        onClose();
        onDone();
      } else {
        setError(r.error);
        setFe(r.fieldErrors ?? {});
      }
    });
  }

  return (
    <Dialog open onOpenChange={(o) => !o && !pending && onClose()}>
      <DialogContent data-testid="edit-agreement-dialog" className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Договор и условия</DialogTitle>
          <DialogDescription>Стоимость, доля компании и политика после расчёта не меняются: при ошибке создайте новое соглашение.</DialogDescription>
        </DialogHeader>
        <form className="grid gap-4" onSubmit={(e) => { e.preventDefault(); submit(e.currentTarget); }}>
          <FormAlert error={error} />
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="grid gap-2">
              <Label htmlFor="ag-cnum">Номер договора</Label>
              <Input id="ag-cnum" name="contract_number" defaultValue={defaults.contract_number ?? ""} className="h-10" disabled={pending} />
              {fe.contract_number && <p className="text-xs text-destructive">{fe.contract_number}</p>}
            </div>
            <div className="grid gap-2">
              <Label htmlFor="ag-cdate">Дата договора</Label>
              <Input id="ag-cdate" name="contract_date" type="date" defaultValue={defaults.contract_date ?? ""} className="h-10" disabled={pending} />
            </div>
          </div>
          <div className="grid gap-2">
            <Label htmlFor="ag-cdoc">Файл договора</Label>
            <Select id="ag-cdoc" name="contract_document_id" defaultValue={defaults.contract_document_id ?? ""} disabled={pending} className="h-10">
              <option value="">— не выбран —</option>
              {contractDocs.map((d) => (
                <option key={d.id} value={d.id}>{d.title}</option>
              ))}
            </Select>
            <p className="text-xs text-muted-foreground">Сначала загрузите договор во вкладке «Документы» этого соглашения.</p>
          </div>
          <div className="grid gap-2">
            <Label htmlFor="ag-cond">Условия</Label>
            <Textarea id="ag-cond" name="conditions" rows={2} defaultValue={defaults.conditions ?? ""} disabled={pending} />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="grid gap-2">
              <Label htmlFor="ag-pass">Условие успеха</Label>
              <Textarea id="ag-pass" name="pass_condition" rows={2} defaultValue={defaults.pass_condition ?? ""} disabled={pending} />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="ag-fail">Условие неудачи</Label>
              <Textarea id="ag-fail" name="fail_condition" rows={2} defaultValue={defaults.fail_condition ?? ""} disabled={pending} />
            </div>
          </div>
          <div className="grid gap-2">
            <Label htmlFor="ag-note">Примечание</Label>
            <Textarea id="ag-note" name="note" rows={2} defaultValue={defaults.note ?? ""} disabled={pending} />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="ag-reason">Причина изменения</Label>
            <Textarea id="ag-reason" name="reason" rows={2} disabled={pending} required aria-invalid={fe.reason ? true : undefined} />
            {fe.reason && <p className="text-xs text-destructive">{fe.reason}</p>}
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" className={btn} onClick={onClose} disabled={pending}>Отмена</Button>
            <Button type="submit" className={btn} disabled={pending}>
              {pending && <Loader2 className="animate-spin" aria-hidden="true" />} Сохранить
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
