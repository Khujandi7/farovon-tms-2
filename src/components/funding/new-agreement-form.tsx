"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { FormAlert } from "@/components/auth/form-parts";
import { useToast } from "@/components/workflow/toast";
import { createAgreement } from "@/app/(app)/funding/actions";
import { formatDate, formatMoney, formatPercent } from "@/lib/format";
import { computeShares } from "@/lib/funding/calc";
import { POLICY_SCOPE_LABELS } from "@/lib/funding/status";
import type { AgreementFormOptions } from "@/lib/funding/queries";
import { CURRENCIES } from "@/lib/workflows/schemas";
import { LegalWarning } from "./legal-warning";

const btn = "min-h-10";

export function NewAgreementForm({ employeeId, options, onCancel }: { employeeId: string; options: AgreementFormOptions; onCancel?: () => void }) {
  const router = useRouter();
  const { notify } = useToast();
  const [kind, setKind] = useState<"training" | "exam">(options.trainings.length || !options.exams.length ? "training" : "exam");
  const [policyId, setPolicyId] = useState("");
  const [coverage, setCoverage] = useState("");
  const [cost, setCost] = useState("");
  const [currency, setCurrency] = useState("TJS");
  const [error, setError] = useState<string | undefined>();
  const [fe, setFe] = useState<Record<string, string | undefined>>({});
  const [pending, startTransition] = useTransition();
  const today = new Date().toISOString().slice(0, 10);

  const policy = options.policies.find((p) => p.id === policyId);
  const effectiveCoverage = coverage !== "" ? Number(coverage.replace(",", ".")) : policy?.company_coverage_percent;
  const totalNum = Number(cost.replace(",", "."));
  const shares = cost !== "" && effectiveCoverage !== undefined ? computeShares(totalNum, effectiveCoverage) : null;

  function submit(form: HTMLFormElement) {
    const fd = new FormData(form);
    setError(undefined);
    setFe({});
    const values = {
      employee_id: employeeId,
      training_id: kind === "training" ? fd.get("target") : "",
      exam_id: kind === "exam" ? fd.get("target") : "",
      policy_id: policyId,
      total_cost: cost.replace(",", "."),
      currency,
      cost_date: fd.get("cost_date"),
      company_coverage_percent: coverage.replace(",", "."),
      contract_number: fd.get("contract_number"),
      contract_date: fd.get("contract_date"),
      conditions: fd.get("conditions"),
      pass_condition: fd.get("pass_condition"),
      fail_condition: fd.get("fail_condition"),
      note: fd.get("note"),
    };
    startTransition(async () => {
      const r = await createAgreement({ values, reason: String(fd.get("reason") ?? "") });
      if (r.ok) {
        notify(true, r.message ?? "Готово.");
        router.push(`/funding/${r.data.id}`);
        router.refresh();
      } else {
        setError(r.error);
        setFe(r.fieldErrors ?? {});
      }
    });
  }

  const list = kind === "training" ? options.trainings : options.exams;
  const targetError = fe.training_id ?? fe.exam_id;

  return (
    <form className="grid gap-4" onSubmit={(e) => { e.preventDefault(); submit(e.currentTarget); }} data-testid="new-agreement-form">
      <LegalWarning compact />
      <FormAlert error={error} />
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="grid gap-2">
          <Label htmlFor="na-kind">Что финансируется</Label>
          <Select id="na-kind" value={kind} onChange={(e) => setKind(e.target.value as "training" | "exam")} disabled={pending} className="h-10">
            <option value="training">Обучение</option>
            <option value="exam">Экзамен</option>
          </Select>
        </div>
        <div className="grid gap-2">
          <Label htmlFor="na-target">{kind === "training" ? "Обучение" : "Экзамен"}</Label>
          <Select id="na-target" name="target" key={kind} defaultValue="" disabled={pending} className="h-10" aria-invalid={targetError ? true : undefined}>
            <option value="">— выберите —</option>
            {list.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
          </Select>
          {list.length === 0 && <p className="text-xs text-muted-foreground">У сотрудника нет {kind === "training" ? "обучений" : "экзаменов"}. Добавьте участие или экзамен заранее.</p>}
          {targetError && <p className="text-xs text-destructive">{targetError}</p>}
        </div>
      </div>

      <div className="grid gap-2">
        <Label htmlFor="na-policy">Политика финансирования</Label>
        <Select id="na-policy" value={policyId} onChange={(e) => { setPolicyId(e.target.value); setCoverage(""); }} disabled={pending} className="h-10">
          <option value="">— без политики (обязательство не рассчитается) —</option>
          {options.policies.map((p) => (
            <option key={p.id} value={p.id}>{p.name} · {formatPercent(p.company_coverage_percent)} · {POLICY_SCOPE_LABELS[p.scope] ?? p.scope}{p.effective_to ? ` · до ${formatDate(p.effective_to)}` : ""}</option>
          ))}
        </Select>
        {options.policies.length === 0 && <p className="text-xs text-muted-foreground">Подтверждённых политик нет. Обязательство можно будет рассчитать только после создания и подтверждения политики.</p>}
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <div className="grid gap-2">
          <Label htmlFor="na-cost">Стоимость</Label>
          <Input id="na-cost" inputMode="decimal" value={cost} onChange={(e) => setCost(e.target.value)} disabled={pending} className="h-10" aria-invalid={fe.total_cost ? true : undefined} />
          {kind === "exam" && <p className="text-xs text-muted-foreground">Пусто — возьмётся из стоимости экзамена.</p>}
          {fe.total_cost && <p className="text-xs text-destructive">{fe.total_cost}</p>}
        </div>
        <div className="grid gap-2">
          <Label htmlFor="na-cur">Валюта</Label>
          <Select id="na-cur" value={currency} onChange={(e) => setCurrency(e.target.value)} disabled={pending} className="h-10">
            {CURRENCIES.map((c) => <option key={c} value={c}>{c}</option>)}
          </Select>
        </div>
        <div className="grid gap-2">
          <Label htmlFor="na-date">Дата расходов</Label>
          <Input id="na-date" name="cost_date" type="date" defaultValue={today} disabled={pending} className="h-10" />
          {fe.cost_date && <p className="text-xs text-destructive">{fe.cost_date}</p>}
        </div>
      </div>

      <div className="grid gap-2">
        <Label htmlFor="na-cov">Доля компании, %{policy ? ` (по политике: ${formatPercent(policy.company_coverage_percent)})` : ""}</Label>
        <Input id="na-cov" inputMode="decimal" value={coverage} onChange={(e) => setCoverage(e.target.value)} placeholder={policy ? String(policy.company_coverage_percent) : "0–100"} disabled={pending} className="h-10" aria-invalid={fe.company_coverage_percent ? true : undefined} aria-describedby="na-shares" />
        {fe.company_coverage_percent && <p className="text-xs text-destructive">{fe.company_coverage_percent}</p>}
        <p id="na-shares" className="text-xs text-muted-foreground" data-testid="shares-preview">
          {shares ? `Компания: ${formatMoney(shares.company, currency)} · Сотрудник: ${formatMoney(shares.employee, currency)}` : "Доли рассчитаются после ввода стоимости и доли компании."}
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="grid gap-2">
          <Label htmlFor="na-cnum">Номер договора</Label>
          <Input id="na-cnum" name="contract_number" disabled={pending} className="h-10" />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="na-cdate">Дата договора</Label>
          <Input id="na-cdate" name="contract_date" type="date" disabled={pending} className="h-10" />
        </div>
      </div>
      <p className="-mt-2 text-xs text-muted-foreground">Файл договора загружается на карточке соглашения. Без номера или файла договора расчёт обязательства невозможен.</p>

      <div className="grid gap-2">
        <Label htmlFor="na-cond">Условия</Label>
        <Textarea id="na-cond" name="conditions" rows={2} disabled={pending} />
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="grid gap-2">
          <Label htmlFor="na-pass">Условие успеха</Label>
          <Textarea id="na-pass" name="pass_condition" rows={2} disabled={pending} />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="na-fail">Условие неудачи</Label>
          <Textarea id="na-fail" name="fail_condition" rows={2} disabled={pending} />
        </div>
      </div>
      <div className="grid gap-2">
        <Label htmlFor="na-note">Примечание</Label>
        <Textarea id="na-note" name="note" rows={2} disabled={pending} />
      </div>
      <div className="grid gap-2">
        <Label htmlFor="na-reason">Причина (необязательно)</Label>
        <Input id="na-reason" name="reason" disabled={pending} className="h-10" />
      </div>
      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        {onCancel && <Button type="button" variant="outline" className={btn} onClick={onCancel} disabled={pending}>Отмена</Button>}
        <Button type="submit" className={btn} disabled={pending} data-testid="create-agreement-submit">
          {pending && <Loader2 className="animate-spin" aria-hidden="true" />} Создать соглашение
        </Button>
      </div>
    </form>
  );
}

export function NewAgreementDialog({ employeeId, employeeName, options }: { employeeId: string; employeeName?: string; options: AgreementFormOptions }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button size="sm" className={btn} onClick={() => setOpen(true)} data-testid="new-agreement">
        <Plus aria-hidden="true" /> Новое соглашение
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-2xl max-sm:h-[calc(100dvh-1rem)] max-sm:w-[calc(100vw-1rem)]" data-testid="new-agreement-dialog">
          <DialogHeader>
            <DialogTitle>Новое соглашение о финансировании</DialogTitle>
            <DialogDescription>{employeeName ? `Сотрудник: ${employeeName}. ` : ""}Соглашение фиксирует долю компании. Обязательство рассчитывается отдельно, после результата.</DialogDescription>
          </DialogHeader>
          {open && <NewAgreementForm employeeId={employeeId} options={options} onCancel={() => setOpen(false)} />}
        </DialogContent>
      </Dialog>
    </>
  );
}
