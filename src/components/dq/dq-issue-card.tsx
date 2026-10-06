"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Check, ExternalLink, Eye, Link2, Pencil, Search } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { ReasonDialog } from "@/components/workflow/reason-dialog";
import { useToast } from "@/components/workflow/toast";
import { resolveDqIssue } from "@/app/(app)/data-quality/actions";
import { linkRequest } from "@/app/(app)/trainings/actions";
import { DQ_SEVERITY_LABELS, DQ_SEVERITY_VARIANT, DQ_STATUS_LABELS } from "@/lib/labels";
import { actionsFor, planFact, ruleTitle, type DqAction } from "@/lib/dq/catalog";
import type { Database } from "@/types/database";

export type DqIssueView = {
  id: number;
  rule_code: string;
  severity: Database["public"]["Enums"]["dq_severity"];
  entity_table: string | null;
  entity_id: string | null;
  message: string;
  suggestion: string | null;
  status: string;
  details: Record<string, unknown> | null;
  resolution: string | null;
};
export type Choice = { id: string; label: string };

const ICON: Record<DqAction["kind"], typeof Eye> = { open: ExternalLink, fix: Pencil, choose: Search, "link-request": Link2, "link-training": Link2, review: Eye, confirm: Check };

/** Карточка проблемы с действиями. Доступно только ролям, которые могут решать проблемы (canAct). */
export function DqIssueCard({ issue, canAct, requestChoices, trainingChoices }: { issue: DqIssueView; canAct: boolean; requestChoices: Choice[]; trainingChoices: Choice[] }) {
  const router = useRouter();
  const { notify } = useToast();
  const [dialog, setDialog] = useState<null | "confirm" | "ignore" | "link-request" | "link-training">(null);
  const [choice, setChoice] = useState("");
  const [busy, setBusy] = useState(false);
  const pf = planFact(issue.details);
  const open = issue.status === "OPEN" || issue.status === "IN_REVIEW";

  async function review() {
    setBusy(true);
    const r = await resolveDqIssue({ id: issue.id, action: "IN_REVIEW", reason: null });
    setBusy(false);
    notify(r.ok, r.ok ? "Оставлено на проверке." : r.error);
    if (r.ok) router.refresh();
  }
  async function reopen() {
    setBusy(true);
    const r = await resolveDqIssue({ id: issue.id, action: "REOPEN", reason: null });
    setBusy(false);
    notify(r.ok, r.ok ? "Проблема открыта снова." : r.error);
    if (r.ok) router.refresh();
  }

  return (
    <li className="rounded-xl border bg-card p-4 shadow-xs" data-testid="dq-issue" data-rule={issue.rule_code}>
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant={DQ_SEVERITY_VARIANT[issue.severity]}>{DQ_SEVERITY_LABELS[issue.severity]}</Badge>
        <span className="text-sm font-medium">{ruleTitle(issue.rule_code)}</span>
        <Badge variant="outline">{DQ_STATUS_LABELS[issue.status] ?? issue.status}</Badge>
      </div>
      <p className="mt-2 text-sm">{issue.message}</p>
      {pf && (
        <div className="mt-2 flex flex-wrap gap-3 text-xs" data-testid="plan-fact">
          <span className="rounded-md bg-muted px-2 py-1">План: <strong>{pf.plan}</strong></span>
          <span className="rounded-md bg-muted px-2 py-1">Факт: <strong>{pf.fact}</strong></span>
          <span className="rounded-md bg-muted px-2 py-1">Разница: <strong>{pf.fact - pf.plan > 0 ? "+" : ""}{pf.fact - pf.plan}</strong></span>
        </div>
      )}
      {issue.suggestion && <p className="mt-2 text-xs text-muted-foreground">Что сделать: {issue.suggestion}</p>}
      {issue.resolution && !open && <p className="mt-2 text-xs text-muted-foreground">Решение: {issue.resolution}</p>}
      <div className="mt-3 flex flex-wrap gap-2">
        {open &&
          actionsFor(issue).map((a) => {
            const Icon = ICON[a.kind];
            if (a.href) {
              return (
                <Button key={a.kind + a.label} asChild size="sm" variant={a.kind === "open" ? "outline" : "secondary"}>
                  <Link href={a.href}><Icon aria-hidden="true" /> {a.label}</Link>
                </Button>
              );
            }
            if (!canAct) return null;
            const onClick = a.kind === "review" ? review : a.kind === "confirm" ? () => setDialog("confirm") : () => { setChoice(""); setDialog(a.kind as "link-request" | "link-training"); };
            return (
              <Button key={a.kind + a.label} size="sm" variant="secondary" onClick={onClick} disabled={busy}>
                <Icon aria-hidden="true" /> {a.label}
              </Button>
            );
          })}
        {open && canAct && (
          <Button size="sm" variant="ghost" onClick={() => setDialog("ignore")} disabled={busy}>Игнорировать</Button>
        )}
        {!open && canAct && issue.status !== "FIXED" && (
          <Button size="sm" variant="outline" onClick={reopen} disabled={busy}>Открыть снова</Button>
        )}
      </div>

      <ReasonDialog
        open={dialog === "confirm" || dialog === "ignore"}
        title={dialog === "ignore" ? "Игнорировать замечание" : "Подтвердить как есть"}
        description={dialog === "ignore" ? "Замечание скроется из списка. Причина сохраняется." : "Вы подтверждаете, что данные верны. Замечание закроется."}
        confirmLabel={dialog === "ignore" ? "Игнорировать" : "Подтвердить"}
        testId="dq-confirm-dialog"
        onClose={() => setDialog(null)}
        onConfirm={(reason) => resolveDqIssue({ id: issue.id, action: dialog === "ignore" ? "IGNORE" : "CONFIRM_OK", reason })}
        onDone={() => router.refresh()}
      />
      <ReasonDialog
        open={dialog === "link-request"}
        title="Связать тренинг с заявкой"
        description="Тренинг станет плановым."
        confirmLabel="Связать"
        testId="dq-link-dialog"
        onClose={() => setDialog(null)}
        onConfirm={(reason) => (choice && issue.entity_id ? linkRequest({ trainingId: issue.entity_id, requestId: choice, sourceType: "PLANNED", confirm: true, reason }) : Promise.resolve({ ok: false as const, error: "Выберите заявку." }))}
        onDone={() => router.refresh()}
      >
        <div className="grid gap-2">
          <Label htmlFor={`dq-req-${issue.id}`}>Заявка</Label>
          <Select id={`dq-req-${issue.id}`} value={choice} onChange={(e) => setChoice(e.target.value)}>
            <option value="">— выберите —</option>
            {requestChoices.map((c) => (
              <option key={c.id} value={c.id}>{c.label}</option>
            ))}
          </Select>
        </div>
      </ReasonDialog>
      <ReasonDialog
        open={dialog === "link-training"}
        title="Связать заявку с тренингом"
        description="Показаны тренинги без заявки. Выбранный тренинг станет плановым."
        confirmLabel="Связать"
        testId="dq-link-dialog"
        onClose={() => setDialog(null)}
        onConfirm={(reason) => (choice && issue.entity_id ? linkRequest({ trainingId: choice, requestId: issue.entity_id, sourceType: "PLANNED", confirm: true, reason }) : Promise.resolve({ ok: false as const, error: "Выберите тренинг." }))}
        onDone={() => router.refresh()}
      >
        <div className="grid gap-2">
          <Label htmlFor={`dq-tr-${issue.id}`}>Тренинг</Label>
          <Select id={`dq-tr-${issue.id}`} value={choice} onChange={(e) => setChoice(e.target.value)}>
            <option value="">— выберите —</option>
            {trainingChoices.map((c) => (
              <option key={c.id} value={c.id}>{c.label}</option>
            ))}
          </Select>
        </div>
      </ReasonDialog>
    </li>
  );
}
