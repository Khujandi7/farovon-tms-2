"use client";

import { useMemo, useState, useTransition } from "react";
import { CheckCircle2, Loader2, Send } from "lucide-react";
import { submitPublicRequest } from "@/app/request/actions";
import { FormAlert } from "@/components/auth/form-parts";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { PUBLIC_FORMATS, PUBLIC_FORMAT_LABELS, type PublicOptions } from "@/lib/portal/schemas";

type Values = {
  requester_name: string;
  contact: string;
  department_id: string;
  unit_id: string;
  topic: string;
  direction: string;
  goal: string;
  participants_planned: string;
  format: string;
  period: string;
  comment: string;
  website: string;
};

const EMPTY: Values = {
  requester_name: "",
  contact: "",
  department_id: "",
  unit_id: "",
  topic: "",
  direction: "",
  goal: "",
  participants_planned: "",
  format: "",
  period: "",
  comment: "",
  website: "",
};

function FieldBox({ id, label, required, error, hint, children }: { id: string; label: string; required?: boolean; error?: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="grid gap-1.5">
      <Label htmlFor={id}>
        {label}
        {required && <span className="text-destructive" aria-hidden="true"> *</span>}
      </Label>
      {children}
      {hint && !error && <p className="text-xs text-muted-foreground">{hint}</p>}
      {error && (
        <p id={`${id}-error`} className="text-xs text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}

export function RequestForm({ token, options }: { token: string | null; options: PublicOptions }) {
  const fixedDept = options.mode === "DEPARTMENT" ? options.departments[0] : null;
  const [v, setV] = useState<Values>({ ...EMPTY, department_id: fixedDept ? String(fixedDept.id) : "" });
  const [errors, setErrors] = useState<Record<string, string | undefined>>({});
  const [formError, setFormError] = useState<string | undefined>();
  const [done, setDone] = useState<{ code: string | null } | null>(null);
  const [closed, setClosed] = useState(false);
  const [pending, start] = useTransition();

  const dept = useMemo(() => options.departments.find((d) => String(d.id) === v.department_id) ?? null, [options, v.department_id]);
  const set = (k: keyof Values) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    const value = e.target.value;
    setV((p) => ({ ...p, [k]: value, ...(k === "department_id" ? { unit_id: "" } : {}) }));
  };
  const err = (k: string) => errors[k];
  const ariaFor = (k: string) => ({ "aria-invalid": err(k) ? true : undefined, "aria-describedby": err(k) ? `${k}-error` : undefined });

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setErrors({});
    setFormError(undefined);
    start(async () => {
      const res = await submitPublicRequest({ token, values: v });
      if (res.ok) {
        setDone({ code: res.code });
        return;
      }
      if (res.kind === "closed") {
        setClosed(true);
        return;
      }
      setFormError(res.error);
      setErrors(res.fieldErrors ?? {});
    });
  }

  if (closed) {
    return (
      <div className="rounded-xl border bg-card px-6 py-10 text-center" data-testid="request-closed" role="alert">
        <h1 className="text-xl font-semibold">Ссылка недействительна</h1>
        <p className="mt-2 text-sm text-muted-foreground">Приём заявок по этой ссылке закрыт. Запросите актуальную ссылку в Академии Фаровон.</p>
      </div>
    );
  }

  if (done) {
    return (
      <div className="flex flex-col items-center gap-3 rounded-xl border bg-card px-6 py-10 text-center" data-testid="request-success" role="status">
        <CheckCircle2 className="size-10 text-success" aria-hidden="true" />
        <h1 className="text-xl font-semibold">Заявка принята</h1>
        {done.code && (
          <p className="text-sm text-muted-foreground">
            Номер заявки: <strong className="font-mono text-base text-foreground" data-testid="request-code">{done.code}</strong>
          </p>
        )}
        <p className="max-w-md text-sm text-muted-foreground">Заявка на рассмотрении. Академия Фаровон свяжется с вами по указанным контактам.</p>
        {done.code && <p className="text-xs text-muted-foreground">Сохраните номер: по нему можно уточнить статус.</p>}
      </div>
    );
  }

  return (
    <form onSubmit={submit} noValidate className="space-y-5 rounded-xl border bg-card p-4 sm:p-6" data-testid="request-form">
      <div className="space-y-1">
        <h1 className="text-xl font-semibold tracking-tight">{options.label}</h1>
        <p className="text-sm text-muted-foreground">Поля со звёздочкой обязательны. Вход в систему не нужен.</p>
      </div>
      <FormAlert error={formError} />

      <FieldBox id="requester_name" label="ФИО инициатора" required error={err("requester_name")}>
        <Input id="requester_name" name="requester_name" className="h-11" autoComplete="name" value={v.requester_name} onChange={set("requester_name")} maxLength={120} disabled={pending} {...ariaFor("requester_name")} />
      </FieldBox>

      <FieldBox id="contact" label="Контакт для связи" hint="Телефон или email" error={err("contact")}>
        <Input id="contact" name="contact" className="h-11" autoComplete="off" value={v.contact} onChange={set("contact")} maxLength={200} disabled={pending} {...ariaFor("contact")} />
      </FieldBox>

      <FieldBox id="department_id" label="Подразделение" required error={err("department_id")}>
        {fixedDept ? (
          <div id="department_id" className="flex h-11 items-center rounded-md border bg-muted/50 px-3 text-sm font-medium" data-testid="fixed-department">
            {fixedDept.name}
          </div>
        ) : (
          <Select id="department_id" name="department_id" className="h-11" value={v.department_id} onChange={set("department_id")} disabled={pending} {...ariaFor("department_id")}>
            <option value="">Выберите подразделение</option>
            {options.departments.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
          </Select>
        )}
      </FieldBox>

      {dept && dept.units.length > 0 && (
        <FieldBox id="unit_id" label="Отдел" error={err("unit_id")}>
          <Select id="unit_id" name="unit_id" className="h-11" value={v.unit_id} onChange={set("unit_id")} disabled={pending} {...ariaFor("unit_id")}>
            <option value="">Не выбран</option>
            {dept.units.map((u) => (
              <option key={u.id} value={u.id}>
                {u.name}
              </option>
            ))}
          </Select>
        </FieldBox>
      )}

      <FieldBox id="topic" label="Тема обучения" required error={err("topic")}>
        <Input id="topic" name="topic" className="h-11" value={v.topic} onChange={set("topic")} maxLength={300} disabled={pending} {...ariaFor("topic")} />
      </FieldBox>

      <FieldBox id="direction" label="Направление" error={err("direction")}>
        <Input id="direction" name="direction" className="h-11" value={v.direction} onChange={set("direction")} maxLength={200} disabled={pending} {...ariaFor("direction")} />
      </FieldBox>

      <FieldBox id="goal" label="Цель обучения" required error={err("goal")}>
        <Textarea id="goal" name="goal" rows={4} value={v.goal} onChange={set("goal")} maxLength={2000} disabled={pending} {...ariaFor("goal")} />
      </FieldBox>

      <div className="grid gap-5 sm:grid-cols-2">
        <FieldBox id="participants_planned" label="Количество участников" required error={err("participants_planned")}>
          <Input id="participants_planned" name="participants_planned" className="h-11" type="number" inputMode="numeric" min={1} max={1000} value={v.participants_planned} onChange={set("participants_planned")} disabled={pending} {...ariaFor("participants_planned")} />
        </FieldBox>
        <FieldBox id="format" label="Формат" error={err("format")}>
          <Select id="format" name="format" className="h-11" value={v.format} onChange={set("format")} disabled={pending} {...ariaFor("format")}>
            <option value="">Не важно</option>
            {PUBLIC_FORMATS.map((f) => (
              <option key={f} value={f}>
                {PUBLIC_FORMAT_LABELS[f]}
              </option>
            ))}
          </Select>
        </FieldBox>
      </div>

      <FieldBox id="period" label="Желаемый период" hint="Например: ноябрь 2026" error={err("period")}>
        <Input id="period" name="period" className="h-11" value={v.period} onChange={set("period")} maxLength={200} disabled={pending} {...ariaFor("period")} />
      </FieldBox>

      <FieldBox id="comment" label="Комментарий" error={err("comment")}>
        <Textarea id="comment" name="comment" rows={3} value={v.comment} onChange={set("comment")} maxLength={2000} disabled={pending} {...ariaFor("comment")} />
      </FieldBox>

      {/* Honeypot: скрыт от людей и скринридеров, боты его заполняют */}
      <div aria-hidden="true" className="absolute -left-[9999px] h-0 w-0 overflow-hidden">
        <label htmlFor="website">Не заполняйте это поле</label>
        <input id="website" name="website" type="text" tabIndex={-1} autoComplete="off" value={v.website} onChange={set("website")} />
      </div>

      <Button type="submit" size="lg" className="h-11 w-full" disabled={pending} data-testid="request-submit">
        {pending ? <Loader2 className="animate-spin" aria-hidden="true" /> : <Send aria-hidden="true" />}
        Отправить заявку
      </Button>
    </form>
  );
}
