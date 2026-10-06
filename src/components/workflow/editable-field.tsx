"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, Loader2, Pencil, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { updateTrainingField } from "@/app/(app)/trainings/actions";
import { updateRequestField } from "@/app/(app)/trainings/requests/actions";
import { updateEmployeeField } from "@/app/(app)/employees/actions";
import { useToast } from "./toast";

export type EditableEntity = "training" | "request" | "employee";
export type FieldKind = "text" | "textarea" | "number" | "date" | "select" | "checkbox";
type Option = { value: string; label: string };

const ACTIONS = { training: updateTrainingField, request: updateRequestField, employee: updateEmployeeField } as const;

/**
 * Inline-редактирование одного поля: наведение → ✎ → поле → «Сохранить»/«Отмена».
 * Сохранение идёт через серверное действие → RPC (проверка роли, валидация, аудит, пересчёт). Без перезагрузки страницы:
 * после успеха обновляются только данные (router.refresh()). Если роль не позволяет — ✎ не показывается.
 */
export function EditableField({
  entity,
  id,
  field,
  label,
  value,
  display,
  kind = "text",
  options,
  canEdit,
  reasonRequired = false,
  hint,
  inputMode,
}: {
  entity: EditableEntity;
  id: string;
  field: string;
  label: string;
  value: string | number | boolean | null;
  display?: React.ReactNode;
  kind?: FieldKind;
  options?: Option[];
  canEdit: boolean;
  reasonRequired?: boolean;
  hint?: string;
  inputMode?: "numeric" | "decimal";
}) {
  const router = useRouter();
  const { notify } = useToast();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<string | boolean>(typeof value === "boolean" ? value : value === null ? "" : String(value));
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | undefined>();
  const [pending, startTransition] = useTransition();
  const inputRef = useRef<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement | null>(null);
  const fieldId = `${entity}-${id}-${field}`;

  const original = typeof value === "boolean" ? value : value === null ? "" : String(value);
  const changed = draft !== original;

  function open() {
    setDraft(original);
    setReason("");
    setError(undefined);
    setEditing(true);
  }
  function cancel() {
    if (pending) return;
    setEditing(false);
    setError(undefined);
  }
  function save() {
    if (!changed) return setEditing(false);
    if (reasonRequired && reason.trim().length < 3) return setError("Укажите причину изменения (не короче 3 символов).");
    setError(undefined);
    startTransition(async () => {
      const raw = kind === "checkbox" ? draft === true : kind === "number" ? (draft === "" ? null : draft) : draft === "" ? null : draft;
      const result = await ACTIONS[entity]({ id, field, value: raw, reason: reason.trim() || null });
      if (result.ok) {
        notify(true, `${label}: сохранено.`);
        setEditing(false);
        router.refresh();
      } else {
        setError(result.fieldErrors?.value ?? result.fieldErrors?.reason ?? result.error);
      }
    });
  }

  const shown = display ?? (value === null || value === "" ? <span className="text-muted-foreground">—</span> : String(value));

  if (!editing) {
    return (
      <div className="group grid gap-0.5" data-testid={`field-${field}`}>
        <dt className="text-xs text-muted-foreground">{label}</dt>
        <dd className="flex min-h-7 items-start gap-1.5 text-sm break-words">
          <span className="min-w-0 flex-1">{shown}</span>
          {canEdit && (
            <button
              type="button"
              onClick={open}
              aria-label={`Изменить: ${label}`}
              title={`Изменить: ${label}`}
              className="rounded p-1 text-muted-foreground opacity-100 transition-opacity hover:bg-accent hover:text-foreground focus-visible:opacity-100 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none md:opacity-0 md:group-hover:opacity-100"
            >
              <Pencil className="size-3.5" aria-hidden="true" />
            </button>
          )}
        </dd>
      </div>
    );
  }

  const common = {
    id: fieldId,
    disabled: pending,
    "aria-invalid": error ? true : undefined,
    "aria-describedby": error ? `${fieldId}-error` : undefined,
    onKeyDown: (e: React.KeyboardEvent) => {
      if (e.key === "Escape") cancel();
      if (e.key === "Enter" && kind !== "textarea" && !e.shiftKey) {
        e.preventDefault();
        save();
      }
    },
  };

  return (
    <div className="grid gap-2 rounded-lg border bg-card p-3 shadow-xs" data-testid={`field-${field}-editor`}>
      <label htmlFor={fieldId} className="text-xs font-medium text-muted-foreground">
        {label}
      </label>
      {kind === "textarea" ? (
        <Textarea {...common} ref={inputRef as React.Ref<HTMLTextAreaElement>} autoFocus rows={3} value={String(draft)} onChange={(e) => setDraft(e.target.value)} />
      ) : kind === "select" ? (
        <Select {...common} ref={inputRef as React.Ref<HTMLSelectElement>} autoFocus value={String(draft)} onChange={(e) => setDraft(e.target.value)}>
          {options?.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </Select>
      ) : kind === "checkbox" ? (
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" {...common} autoFocus checked={draft === true} onChange={(e) => setDraft(e.target.checked)} className="size-4 accent-[var(--brand)]" />
          Да
        </label>
      ) : (
        <Input
          {...common}
          ref={inputRef as React.Ref<HTMLInputElement>}
          autoFocus
          type={kind === "date" ? "date" : kind === "number" ? "text" : "text"}
          inputMode={kind === "number" ? (inputMode ?? "decimal") : undefined}
          value={String(draft)}
          onChange={(e) => setDraft(e.target.value)}
        />
      )}
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
      {(reasonRequired || reason) && (
        <div className="grid gap-1">
          <label htmlFor={`${fieldId}-reason`} className="text-xs font-medium text-muted-foreground">
            Причина изменения{reasonRequired ? " *" : ""}
          </label>
          <Input
            id={`${fieldId}-reason`}
            value={reason}
            disabled={pending}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Почему меняется значение"
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                save();
              }
              if (e.key === "Escape") cancel();
            }}
          />
        </div>
      )}
      {error && (
        <p id={`${fieldId}-error`} role="alert" className="text-xs text-destructive">
          {error}
        </p>
      )}
      <div className={cn("flex gap-2")}>
        <Button type="button" size="sm" onClick={save} disabled={pending}>
          {pending ? <Loader2 className="animate-spin" aria-hidden="true" /> : <Check aria-hidden="true" />}
          Сохранить
        </Button>
        <Button type="button" size="sm" variant="outline" onClick={cancel} disabled={pending}>
          <X aria-hidden="true" /> Отмена
        </Button>
      </div>
    </div>
  );
}
