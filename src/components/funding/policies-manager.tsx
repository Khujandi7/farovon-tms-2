"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, Copy, Loader2, Pencil, Plus, Power } from "lucide-react";
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
import { confirmPolicy, savePolicy, setPolicyActive } from "@/app/(app)/funding/actions";
import { formatDate, formatPercent } from "@/lib/format";
import { computeShares } from "@/lib/funding/calc";
import { POLICY_OUTCOMES, POLICY_SCOPE_LABELS, POLICY_STATE_LABELS, outcomeLabel, policyState, type PolicyState } from "@/lib/funding/status";
import { CURRENCIES } from "@/lib/workflows/schemas";
import { LegalWarning } from "./legal-warning";

export type PolicyRow = {
  id: string;
  name: string;
  scope: string;
  company_coverage_percent: number;
  currency: string | null;
  effective_from: string;
  effective_to: string | null;
  basis: string | null;
  is_active: boolean;
  confirmed_at: string | null;
  outcomes: Record<string, number>;
};

const STATE_VARIANT: Record<PolicyState, "success" | "warning" | "outline"> = { CONFIRMED: "success", DRAFT: "warning", DISABLED: "outline" };
const btn = "min-h-10";

export function PoliciesManager({ policies, canWrite }: { policies: PolicyRow[]; canWrite: boolean }) {
  const router = useRouter();
  const [editing, setEditing] = useState<{ policy: PolicyRow | null; asNewVersion: boolean } | null>(null);
  const [confirming, setConfirming] = useState<PolicyRow | null>(null);
  const [toggling, setToggling] = useState<PolicyRow | null>(null);

  return (
    <section className="space-y-4" data-testid="policies">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-muted-foreground max-w-2xl">
          Обязательство рассчитывается только по подтверждённой политике. Подтверждённая политика неизменяема: изменения вносятся новой версией.
        </p>
        {canWrite && (
          <Button className={btn} onClick={() => setEditing({ policy: null, asNewVersion: false })} data-testid="new-policy">
            <Plus aria-hidden="true" /> Новая политика
          </Button>
        )}
      </div>

      {policies.length === 0 ? (
        <EmptyState className="bg-card" title="Политик пока нет" description={canWrite ? "Создайте политику, затем подтвердите её, чтобы использовать в соглашениях." : undefined} />
      ) : (
        <ul className="grid gap-3 lg:grid-cols-2">
          {policies.map((p) => {
            const state = policyState(p);
            const shares = computeShares(100, p.company_coverage_percent);
            return (
              <li key={p.id} className="space-y-3 rounded-xl border bg-card p-4 shadow-xs" data-testid="policy-card">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <h3 className="font-medium break-words">{p.name}</h3>
                    <p className="text-xs text-muted-foreground">
                      {POLICY_SCOPE_LABELS[p.scope] ?? p.scope} · с {formatDate(p.effective_from)}
                      {p.effective_to ? ` по ${formatDate(p.effective_to)}` : " (бессрочно)"}
                      {p.currency ? ` · ${p.currency}` : ""}
                    </p>
                  </div>
                  <Badge variant={STATE_VARIANT[state]}>{POLICY_STATE_LABELS[state]}</Badge>
                </div>
                <dl className="grid grid-cols-2 gap-2 text-sm">
                  <div>
                    <dt className="text-xs text-muted-foreground">Компания оплачивает</dt>
                    <dd className="font-medium tabular-nums">{formatPercent(p.company_coverage_percent)}</dd>
                  </div>
                  <div>
                    <dt className="text-xs text-muted-foreground">Сотрудник оплачивает</dt>
                    <dd className="font-medium tabular-nums">{formatPercent(shares?.employeePercent)}</dd>
                  </div>
                </dl>
                <div>
                  <p className="text-xs text-muted-foreground">Ответственность сотрудника по результату</p>
                  {Object.keys(p.outcomes).length === 0 ? (
                    <p className="text-sm text-muted-foreground">Исходы не заданы — подтвердить нельзя.</p>
                  ) : (
                    <ul className="mt-1 flex flex-wrap gap-1.5">
                      {POLICY_OUTCOMES.filter((o) => o in p.outcomes).map((o) => (
                        <li key={o}><Badge variant="secondary">{outcomeLabel(o)}: {formatPercent(p.outcomes[o])}</Badge></li>
                      ))}
                    </ul>
                  )}
                </div>
                {p.basis && <p className="text-xs text-muted-foreground">Основание: {p.basis}</p>}
                {canWrite && (
                  <div className="flex flex-wrap gap-2">
                    {!p.confirmed_at && (
                      <>
                        <Button size="sm" variant="outline" className={btn} onClick={() => setEditing({ policy: p, asNewVersion: false })} data-testid="edit-policy">
                          <Pencil aria-hidden="true" /> Изменить
                        </Button>
                        <Button size="sm" className={btn} onClick={() => setConfirming(p)} data-testid="confirm-policy">
                          <CheckCircle2 aria-hidden="true" /> Подтвердить
                        </Button>
                      </>
                    )}
                    {p.confirmed_at && (
                      <Button size="sm" variant="outline" className={btn} onClick={() => setEditing({ policy: p, asNewVersion: true })} data-testid="policy-new-version">
                        <Copy aria-hidden="true" /> Новая версия
                      </Button>
                    )}
                    <Button size="sm" variant="ghost" className={btn} onClick={() => setToggling(p)} data-testid="toggle-policy">
                      <Power aria-hidden="true" /> {p.is_active ? "Отключить" : "Включить"}
                    </Button>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {editing && <PolicyDialog policy={editing.policy} asNewVersion={editing.asNewVersion} onClose={() => setEditing(null)} onDone={() => router.refresh()} />}

      <ReasonDialog
        open={!!confirming}
        title="Подтвердить политику"
        description="После подтверждения название, доля компании, даты и исходы изменить нельзя. Для изменений создаётся новая версия."
        confirmLabel="Подтвердить политику"
        testId="confirm-policy-dialog"
        onClose={() => setConfirming(null)}
        onConfirm={(reason) => confirmPolicy({ id: confirming!.id, reason }).then((r) => (r.ok ? { ok: true as const, message: r.message } : { ok: false as const, error: r.error }))}
        onDone={() => router.refresh()}
      >
        <LegalWarning />
      </ReasonDialog>

      <ReasonDialog
        open={!!toggling}
        title={toggling?.is_active ? "Отключить политику" : "Включить политику"}
        description={toggling?.is_active ? "По отключённой политике нельзя создавать соглашения и рассчитывать обязательства. Уже рассчитанные обязательства не меняются." : "Политика снова станет доступна в соглашениях."}
        confirmLabel={toggling?.is_active ? "Отключить" : "Включить"}
        testId="toggle-policy-dialog"
        onClose={() => setToggling(null)}
        onConfirm={(reason) => setPolicyActive({ id: toggling!.id, active: !toggling!.is_active, reason }).then((r) => (r.ok ? { ok: true as const, message: r.message } : { ok: false as const, error: r.error }))}
        onDone={() => router.refresh()}
      />
    </section>
  );
}

function PolicyDialog({ policy, asNewVersion, onClose, onDone }: { policy: PolicyRow | null; asNewVersion: boolean; onClose: () => void; onDone: () => void }) {
  const { notify } = useToast();
  const [error, setError] = useState<string | undefined>();
  const [fe, setFe] = useState<Record<string, string | undefined>>({});
  const [coverage, setCoverage] = useState(policy ? String(policy.company_coverage_percent) : "100");
  const [checked, setChecked] = useState<Record<string, boolean>>(() => Object.fromEntries(POLICY_OUTCOMES.map((o) => [o, policy ? o in policy.outcomes : o === "PASSED" || o === "FAILED"])));
  const [pct, setPct] = useState<Record<string, string>>(() => Object.fromEntries(POLICY_OUTCOMES.map((o) => [o, policy && o in policy.outcomes ? String(policy.outcomes[o]) : o === "PASSED" ? "0" : o === "FAILED" ? "100" : "0"])));
  const [pending, startTransition] = useTransition();
  const editingDraft = !!policy && !asNewVersion;
  const shares = computeShares(100, Number(coverage.replace(",", ".")));

  function submit(form: HTMLFormElement) {
    const fd = new FormData(form);
    setError(undefined);
    setFe({});
    const outcomes: Record<string, string> = {};
    for (const o of POLICY_OUTCOMES) if (checked[o]) outcomes[o] = (pct[o] ?? "0").replace(",", ".");
    const values = {
      name: fd.get("name"),
      scope: fd.get("scope"),
      company_coverage_percent: coverage.replace(",", "."),
      currency: fd.get("currency"),
      effective_from: fd.get("effective_from"),
      effective_to: fd.get("effective_to"),
      basis: fd.get("basis"),
      outcomes,
    };
    startTransition(async () => {
      const r = await savePolicy({ id: editingDraft ? policy.id : null, values, reason: asNewVersion ? `Новая версия политики «${policy?.name}»` : null });
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
      <DialogContent className="max-w-xl max-sm:h-[calc(100dvh-1rem)] max-sm:w-[calc(100vw-1rem)]" data-testid="policy-dialog">
        <DialogHeader>
          <DialogTitle>{editingDraft ? "Изменить черновик политики" : asNewVersion ? "Новая версия политики" : "Новая политика"}</DialogTitle>
          <DialogDescription>Политика сохраняется как черновик. Использовать её в соглашениях можно только после подтверждения.</DialogDescription>
        </DialogHeader>
        <form className="grid gap-4" onSubmit={(e) => { e.preventDefault(); submit(e.currentTarget); }}>
          <FormAlert error={error} />
          <div className="grid gap-2">
            <Label htmlFor="pol-name">Название</Label>
            <Input id="pol-name" name="name" defaultValue={policy ? (asNewVersion ? `${policy.name} (новая версия)` : policy.name) : ""} className="h-10" disabled={pending} aria-invalid={fe.name ? true : undefined} required />
            {fe.name && <p className="text-xs text-destructive">{fe.name}</p>}
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="grid gap-2">
              <Label htmlFor="pol-scope">Область применения</Label>
              <Select id="pol-scope" name="scope" defaultValue={policy?.scope ?? "ANY"} disabled={pending} className="h-10">
                {Object.entries(POLICY_SCOPE_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </Select>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="pol-cur">Валюта (справочно)</Label>
              <Select id="pol-cur" name="currency" defaultValue={policy?.currency ?? ""} disabled={pending} className="h-10">
                <option value="">Любая</option>
                {CURRENCIES.map((c) => <option key={c} value={c}>{c}</option>)}
              </Select>
            </div>
          </div>
          <div className="grid gap-2">
            <Label htmlFor="pol-cov">Компания оплачивает, %</Label>
            <Input id="pol-cov" inputMode="decimal" value={coverage} onChange={(e) => setCoverage(e.target.value)} className="h-10" disabled={pending} aria-invalid={fe.company_coverage_percent ? true : undefined} aria-describedby="pol-cov-hint" />
            <p id="pol-cov-hint" className="text-xs text-muted-foreground">Сотрудник оплачивает: {shares ? formatPercent(shares.employeePercent) : "—"}</p>
            {fe.company_coverage_percent && <p className="text-xs text-destructive">{fe.company_coverage_percent}</p>}
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="grid gap-2">
              <Label htmlFor="pol-from">Действует с</Label>
              <Input id="pol-from" name="effective_from" type="date" defaultValue={policy?.effective_from ?? ""} className="h-10" disabled={pending} required />
              {fe.effective_from && <p className="text-xs text-destructive">{fe.effective_from}</p>}
            </div>
            <div className="grid gap-2">
              <Label htmlFor="pol-to">Действует по (необязательно)</Label>
              <Input id="pol-to" name="effective_to" type="date" defaultValue={policy?.effective_to ?? ""} className="h-10" disabled={pending} />
              {fe.effective_to && <p className="text-xs text-destructive">{fe.effective_to}</p>}
            </div>
          </div>
          <fieldset className="grid gap-2 rounded-lg border p-3" aria-describedby="pol-out-hint">
            <legend className="px-1 text-sm font-medium">Ответственность сотрудника по результату</legend>
            <p id="pol-out-hint" className="text-xs text-muted-foreground">Доля стоимости, которую сотрудник возмещает при исходе. Например: сдан - 0 %, не сдан - 100 %.</p>
            {POLICY_OUTCOMES.map((o) => (
              <div key={o} className="flex min-h-10 flex-wrap items-center gap-3">
                <label className="flex min-w-44 flex-1 items-center gap-2 text-sm">
                  <input type="checkbox" checked={!!checked[o]} onChange={(e) => setChecked((c) => ({ ...c, [o]: e.target.checked }))} disabled={pending} className="size-4 accent-[var(--brand)]" /> {outcomeLabel(o)}
                </label>
                <div className="flex items-center gap-1">
                  <Input aria-label={`Ответственность сотрудника, %: ${outcomeLabel(o)}`} inputMode="decimal" value={pct[o] ?? ""} onChange={(e) => setPct((c) => ({ ...c, [o]: e.target.value }))} disabled={pending || !checked[o]} className="h-10 w-24" />
                  <span className="text-sm text-muted-foreground">%</span>
                </div>
              </div>
            ))}
            {fe.outcomes && <p className="text-xs text-destructive">{fe.outcomes}</p>}
          </fieldset>
          <div className="grid gap-2">
            <Label htmlFor="pol-basis">Основание (приказ, положение)</Label>
            <Textarea id="pol-basis" name="basis" rows={2} defaultValue={policy?.basis ?? ""} disabled={pending} />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" className={btn} onClick={onClose} disabled={pending}>Отмена</Button>
            <Button type="submit" className={btn} disabled={pending} data-testid="policy-submit">
              {pending && <Loader2 className="animate-spin" aria-hidden="true" />} Сохранить черновик
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
