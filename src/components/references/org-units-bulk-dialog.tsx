"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ListPlus } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { FormAlert } from "@/components/auth/form-parts";
import { useToast } from "@/components/workflow/toast";
import { createOrgUnitsBulk, type BulkResult } from "@/app/(app)/settings/references/actions";
import { previewBulk, type ExistingAlias, type ExistingUnit, type PreviewStatus } from "@/lib/org/bulk";

const STATUS: Record<PreviewStatus, { label: string; variant: "success" | "outline" | "warning" }> = {
  NEW: { label: "Будет создано", variant: "success" },
  DUPLICATE: { label: "Дубликат — пропустится", variant: "outline" },
  ERROR: { label: "Ошибка — не создастся", variant: "warning" },
};

/**
 * Массовое добавление из таблицы: вставка → предпросмотр (дубликаты и ошибки видны до записи) → явное подтверждение.
 * Ничего не создаётся автоматически: запись только по кнопке «Добавить» после предпросмотра.
 */
export function OrgUnitsBulkDialog({ open, onClose, units, aliases = [] }: { open: boolean; onClose: () => void; units: ExistingUnit[]; aliases?: ExistingAlias[] }) {
  const router = useRouter();
  const { notify } = useToast();
  const [pending, start] = useTransition();
  const [text, setText] = useState("");
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | undefined>();
  const [result, setResult] = useState<BulkResult | null>(null);
  const preview = useMemo(() => previewBulk(text, units, aliases), [text, units, aliases]);
  const hasInput = text.trim().length > 0;

  function close() {
    if (pending) return;
    setText(""); setReason(""); setError(undefined); setResult(null);
    onClose();
  }
  function submit() {
    setError(undefined);
    start(async () => {
      const r = await createOrgUnitsBulk({ rows: preview.toCreate, reason: reason.trim() || null, confirmed: true });
      if (r.ok) {
        notify(true, r.message ?? "Готово.");
        setResult(r.data);
        router.refresh();
      } else setError(r.error);
    });
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && close()}>
      <DialogContent data-testid="org-bulk-dialog" className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Массовое добавление подразделений</DialogTitle>
          <DialogDescription>
            Вставьте таблицу: «Департамент» или «Департамент ⇥ Отдел» — по строке на запись (из Excel вставляется табуляцией, можно «;»). Сначала вы увидите предпросмотр, дубликаты и ошибки; запись — только после подтверждения.
          </DialogDescription>
        </DialogHeader>
        {result ? (
          <div className="space-y-3" data-testid="org-bulk-result">
            <p className="text-sm">Добавлено: <strong>{result.created}</strong>, пропущено дублей: <strong>{result.skipped}</strong>{result.errors.length > 0 && <>, с ошибкой: <strong>{result.errors.length}</strong></>}.</p>
            {result.skippedItems.length > 0 && (
              <ul className="list-disc space-y-0.5 pl-5 text-sm text-muted-foreground" data-testid="org-bulk-skipped">
                {result.skippedItems.map((e) => (<li key={e.index}>{e.name}: {e.reason}</li>))}
              </ul>
            )}
            {result.errors.length > 0 && (
              <ul className="list-disc space-y-0.5 pl-5 text-sm text-muted-foreground">
                {result.errors.map((e) => (<li key={e.index}>{e.name || "(без названия)"}: {e.error}</li>))}
              </ul>
            )}
            <DialogFooter><Button type="button" onClick={close}>Закрыть</Button></DialogFooter>
          </div>
        ) : (
          <form className="grid gap-3" onSubmit={(e) => { e.preventDefault(); if (preview.toCreate.length > 0) submit(); }}>
            <FormAlert error={error} />
            <div className="grid gap-1.5">
              <Label htmlFor="org-bulk-text">Список подразделений</Label>
              <Textarea id="org-bulk-text" value={text} onChange={(e) => setText(e.target.value)} rows={6} disabled={pending} placeholder={"Административно-хозяйственное управление\nДепартамент бройлерного направления\tОтдел откорма"} />
            </div>
            {hasInput && (
              <div className="space-y-2" data-testid="org-bulk-preview">
                <p className="text-sm" role="status">
                  Новых: <strong>{preview.counts.new}</strong> · дубликатов: <strong>{preview.counts.duplicate}</strong> · ошибок: <strong>{preview.counts.error}</strong>
                </p>
                <ul className="max-h-60 divide-y overflow-y-auto rounded-lg border text-sm">
                  {preview.rows.map((r, i) => (
                    <li key={i} className="flex flex-wrap items-center gap-2 px-3 py-1.5" data-status={r.status}>
                      <Badge variant={STATUS[r.status].variant}>{STATUS[r.status].label}</Badge>
                      <span className="font-medium">{r.name}</span>
                      <span className="text-xs text-muted-foreground">{r.kind === "UNIT" ? `отдел в «${r.parent}»` : "департамент"}</span>
                      {r.note && <span className="text-xs text-muted-foreground">— {r.note}{r.line > 0 ? ` (строка ${r.line})` : ""}</span>}
                    </li>
                  ))}
                </ul>
              </div>
            )}
            <div className="grid gap-1.5">
              <Label htmlFor="org-bulk-reason">Причина (необязательно)</Label>
              <Textarea id="org-bulk-reason" value={reason} onChange={(e) => setReason(e.target.value)} rows={2} disabled={pending} placeholder="Например: устранение замечаний импорта сотрудников" />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={close} disabled={pending}>Отмена</Button>
              <Button type="submit" disabled={pending || preview.toCreate.length === 0} data-testid="org-bulk-confirm">
                <ListPlus aria-hidden="true" /> Добавить {preview.toCreate.length > 0 ? `(${preview.toCreate.length})` : ""}
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
