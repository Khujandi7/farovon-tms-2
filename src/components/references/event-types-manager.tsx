"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CalendarRange, Check, Loader2, Pencil, Plus, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { FormAlert } from "@/components/auth/form-parts";
import { EmptyState } from "@/components/common/states";
import { useToast } from "@/components/workflow/toast";
import { saveEventType } from "@/app/(app)/settings/references/actions";

export type EventTypeRow = { id: number; code: string; name: string; is_system: boolean; is_group: boolean; is_active: boolean; sort_order: number };

/** Справочник типов мероприятий. Добавляет и меняет только ADMIN. Системные типы нельзя удалить, их код не меняется; тип можно отключить. */
export function EventTypesManager({ types, canEdit }: { types: EventTypeRow[]; canEdit: boolean }) {
  const router = useRouter();
  const { notify } = useToast();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | undefined>();
  const [fieldErrors, setFieldErrors] = useState<Record<string, string | undefined>>({});
  const [editing, setEditing] = useState<number | null>(null);
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [newName, setNewName] = useState("");
  const [isGroup, setIsGroup] = useState(true);

  function run(task: () => ReturnType<typeof saveEventType>, after?: () => void) {
    setError(undefined);
    setFieldErrors({});
    start(async () => {
      const r = await task();
      if (r.ok) {
        notify(true, r.message ?? "Готово.");
        after?.();
        router.refresh();
      } else {
        setError(r.error);
        setFieldErrors(r.fieldErrors ?? {});
      }
    });
  }

  return (
    <div className="space-y-3" data-testid="event-types">
      <FormAlert error={error} />
      {canEdit && (
        <form
          className="grid gap-3 rounded-xl border bg-card p-3 shadow-xs sm:grid-cols-[1.4fr_1fr_auto_auto] sm:items-end"
          onSubmit={(e) => {
            e.preventDefault();
            run(() => saveEventType({ name: newName, code, is_group: isGroup }), () => {
              setNewName("");
              setCode("");
            });
          }}
        >
          <div className="grid gap-1">
            <Label htmlFor="new-type-name" className="text-xs">Название типа</Label>
            <Input id="new-type-name" value={newName} onChange={(e) => setNewName(e.target.value)} disabled={pending} maxLength={200} aria-invalid={fieldErrors.name ? true : undefined} />
            {fieldErrors.name && <p className="text-xs text-destructive">{fieldErrors.name}</p>}
          </div>
          <div className="grid gap-1">
            <Label htmlFor="new-type-code" className="text-xs">Код (латиница)</Label>
            <Input id="new-type-code" value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} disabled={pending} maxLength={40} placeholder="HACKATHON" aria-invalid={fieldErrors.code ? true : undefined} />
            {fieldErrors.code && <p className="text-xs text-destructive">{fieldErrors.code}</p>}
          </div>
          <label className="flex h-9 items-center gap-2 text-sm">
            <input type="checkbox" className="size-4 accent-[var(--brand)]" checked={isGroup} onChange={(e) => setIsGroup(e.target.checked)} disabled={pending} />
            Групповое
          </label>
          <Button type="submit" disabled={pending || newName.trim().length < 2 || code.trim().length < 2} className="max-md:h-10" data-testid="add-event-type">
            <Plus aria-hidden="true" /> Добавить
          </Button>
        </form>
      )}
      {types.length === 0 ? (
        <EmptyState className="bg-card" icon={CalendarRange} compact title="Типов мероприятий нет" description="Справочник пуст или недоступен." />
      ) : (
        <ul className="divide-y rounded-xl border bg-card shadow-xs">
          {types.map((t) => (
            <li key={t.id} className="flex flex-wrap items-center gap-2 px-3 py-2 text-sm" data-testid="event-type-row">
              {editing === t.id ? (
                <form
                  className="flex min-w-0 flex-1 items-center gap-2"
                  onSubmit={(e) => {
                    e.preventDefault();
                    run(() => saveEventType({ id: t.id, name }), () => setEditing(null));
                  }}
                >
                  <Input value={name} onChange={(e) => setName(e.target.value)} aria-label="Название типа" autoFocus disabled={pending} />
                  <Button type="submit" size="icon" variant="ghost" aria-label="Сохранить" disabled={pending}>{pending ? <Loader2 className="animate-spin" /> : <Check />}</Button>
                  <Button type="button" size="icon" variant="ghost" aria-label="Отмена" onClick={() => setEditing(null)} disabled={pending}><X /></Button>
                </form>
              ) : (
                <>
                  <span className={t.is_active ? "font-medium" : "text-muted-foreground line-through"}>{t.name}</span>
                  <span className="font-mono text-xs text-muted-foreground">{t.code}</span>
                  {t.is_system && <Badge variant="secondary">Системный</Badge>}
                  <Badge variant="outline">{t.is_group ? "Групповое" : "Индивидуальное"}</Badge>
                  {!t.is_active && <Badge variant="outline">Отключён</Badge>}
                  {canEdit && (
                    <span className="ml-auto flex gap-1">
                      <Button size="icon" variant="ghost" aria-label={`Переименовать ${t.name}`} onClick={() => { setName(t.name); setEditing(t.id); }} disabled={pending}><Pencil /></Button>
                      {t.code !== "TRAINING" && (
                        <Button size="sm" variant="ghost" className="max-md:h-10" onClick={() => run(() => saveEventType({ id: t.id, name: t.name, is_active: !t.is_active }))} disabled={pending}>
                          {t.is_active ? "Отключить" : "Включить"}
                        </Button>
                      )}
                    </span>
                  )}
                </>
              )}
            </li>
          ))}
        </ul>
      )}
      <p className="text-xs text-muted-foreground">
        Тип нельзя удалить: на него ссылаются мероприятия. Отключённый тип не предлагается в новых мероприятиях, но остаётся в старых.
        {canEdit ? "" : " Менять типы может только администратор."} «Индивидуальное» не учитывается в показателе «проведено обучений».
      </p>
    </div>
  );
}
