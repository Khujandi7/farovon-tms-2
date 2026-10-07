"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Building, Loader2, Pencil, Plus } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Field, FormAlert } from "@/components/auth/form-parts";
import { EmptyState } from "@/components/common/states";
import { useToast } from "@/components/workflow/toast";
import { saveProvider } from "@/app/(app)/settings/references/actions";
import { PROVIDER_KIND_LABELS } from "@/lib/trainings/labels";

export type ProviderRow = { id: string; name: string; kind: string; contact: string | null; note: string | null; is_active: boolean };

/** Провайдеры и организаторы обучения. Ведут ADMIN и менеджер академии; остальные роли только читают. */
export function ProvidersManager({ providers, canEdit }: { providers: ProviderRow[]; canEdit: boolean }) {
  const router = useRouter();
  const { notify } = useToast();
  const [pending, start] = useTransition();
  const [dialog, setDialog] = useState<null | { row: ProviderRow | null }>(null);
  const [error, setError] = useState<string | undefined>();
  const [fieldErrors, setFieldErrors] = useState<Record<string, string | undefined>>({});

  function submit(form: HTMLFormElement, row: ProviderRow | null) {
    const fd = new FormData(form);
    setError(undefined);
    setFieldErrors({});
    start(async () => {
      const r = await saveProvider({ id: row?.id ?? null, name: fd.get("name"), kind: fd.get("kind"), contact: fd.get("contact"), note: fd.get("note"), is_active: row?.is_active });
      if (r.ok) {
        notify(true, r.message ?? "Готово.");
        setDialog(null);
        router.refresh();
      } else {
        setError(r.error);
        setFieldErrors(r.fieldErrors ?? {});
      }
    });
  }
  function toggle(row: ProviderRow) {
    start(async () => {
      const r = await saveProvider({ id: row.id, name: row.name, kind: row.kind, contact: row.contact, note: row.note, is_active: !row.is_active });
      notify(r.ok, r.ok ? (row.is_active ? "Провайдер отключён." : "Провайдер включён.") : r.error);
      if (r.ok) router.refresh();
    });
  }

  return (
    <div className="space-y-3" data-testid="providers">
      {canEdit && (
        <div>
          <Button size="sm" onClick={() => { setError(undefined); setFieldErrors({}); setDialog({ row: null }); }} data-testid="add-provider">
            <Plus aria-hidden="true" /> Добавить провайдера
          </Button>
        </div>
      )}
      {providers.length === 0 ? (
        <EmptyState className="bg-card" icon={Building} compact title="Провайдеров пока нет" description="Добавьте учебные центры, организации и внутренних тренеров." />
      ) : (
        <ul className="divide-y rounded-xl border bg-card shadow-xs">
          {providers.map((p) => (
            <li key={p.id} className="flex flex-wrap items-center gap-2 px-3 py-2 text-sm" data-testid="provider-row">
              <div className="min-w-0">
                <span className={p.is_active ? "font-medium" : "text-muted-foreground line-through"}>{p.name}</span>
                {(p.contact || p.note) && <p className="text-xs text-muted-foreground">{[p.contact, p.note].filter(Boolean).join(" · ")}</p>}
              </div>
              <Badge variant="outline">{PROVIDER_KIND_LABELS[p.kind] ?? p.kind}</Badge>
              {!p.is_active && <Badge variant="outline">Отключён</Badge>}
              {canEdit && (
                <span className="ml-auto flex gap-1">
                  <Button size="icon" variant="ghost" aria-label={`Изменить ${p.name}`} onClick={() => { setError(undefined); setFieldErrors({}); setDialog({ row: p }); }} disabled={pending}><Pencil /></Button>
                  <Button size="sm" variant="ghost" className="max-md:h-10" onClick={() => toggle(p)} disabled={pending}>{p.is_active ? "Отключить" : "Включить"}</Button>
                </span>
              )}
            </li>
          ))}
        </ul>
      )}
      <Dialog open={dialog !== null} onOpenChange={(o) => !o && !pending && setDialog(null)}>
        <DialogContent data-testid="provider-dialog">
          <DialogHeader>
            <DialogTitle>{dialog?.row ? "Изменить провайдера" : "Новый провайдер"}</DialogTitle>
            <DialogDescription>Провайдер указывается в мероприятиях, экзаменах и сертификатах.</DialogDescription>
          </DialogHeader>
          <form key={dialog?.row?.id ?? "new"} className="grid gap-4" onSubmit={(e) => { e.preventDefault(); submit(e.currentTarget, dialog?.row ?? null); }} noValidate>
            <FormAlert error={error} />
            <Field id="name" label="Название *" defaultValue={dialog?.row?.name ?? ""} error={fieldErrors.name} disabled={pending} autoComplete="off" maxLength={200} />
            <div className="grid gap-2">
              <Label htmlFor="kind">Вид</Label>
              <Select id="kind" name="kind" defaultValue={dialog?.row?.kind ?? "EXTERNAL"} disabled={pending}>
                {Object.entries(PROVIDER_KIND_LABELS).map(([v, l]) => (
                  <option key={v} value={v}>{l}</option>
                ))}
              </Select>
            </div>
            <Field id="contact" label="Контакт" defaultValue={dialog?.row?.contact ?? ""} disabled={pending} maxLength={300} />
            <div className="grid gap-2">
              <Label htmlFor="note">Заметка</Label>
              <Textarea id="note" name="note" rows={2} defaultValue={dialog?.row?.note ?? ""} disabled={pending} maxLength={1000} />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setDialog(null)} disabled={pending}>Отмена</Button>
              <Button type="submit" disabled={pending}>{pending && <Loader2 className="animate-spin" aria-hidden="true" />} Сохранить</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
