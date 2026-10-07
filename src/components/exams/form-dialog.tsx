"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { FormAlert } from "@/components/auth/form-parts";
import { useToast } from "@/components/workflow/toast";

export type FormOutcome = { ok: true; message?: string } | { ok: false; error: string; fieldErrors?: Record<string, string | undefined> };
export type FieldErrors = Record<string, string | undefined>;

/**
 * Диалог с формой: кнопка-триггер, FormData → серверное действие, ошибки по полям, toast и router.refresh().
 * Закрывается только после успешного ответа сервера.
 */
export function FormDialog({
  trigger,
  title,
  description,
  submitLabel,
  testId,
  onSubmit,
  onDone,
  children,
  wide,
}: {
  trigger: (open: () => void) => React.ReactNode;
  title: string;
  description?: React.ReactNode;
  submitLabel: string;
  testId: string;
  onSubmit: (fd: FormData) => Promise<FormOutcome>;
  onDone?: () => void;
  children: (ctx: { pending: boolean; errors: FieldErrors }) => React.ReactNode;
  wide?: boolean;
}) {
  const router = useRouter();
  const { notify } = useToast();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | undefined>();
  const [errors, setErrors] = useState<FieldErrors>({});
  const [pending, start] = useTransition();

  function change(o: boolean) {
    if (pending) return;
    setOpen(o);
    if (!o) {
      setError(undefined);
      setErrors({});
    }
  }

  function submit(form: HTMLFormElement) {
    const fd = new FormData(form);
    setError(undefined);
    setErrors({});
    start(async () => {
      const r = await onSubmit(fd);
      if (r.ok) {
        notify(true, r.message ?? "Готово.");
        setOpen(false);
        onDone?.();
        router.refresh();
      } else {
        setError(r.error);
        setErrors(r.fieldErrors ?? {});
      }
    });
  }

  return (
    <>
      {trigger(() => setOpen(true))}
      <Dialog open={open} onOpenChange={change}>
        <DialogContent data-testid={testId} className={wide ? "sm:max-w-xl" : undefined}>
          <DialogHeader>
            <DialogTitle>{title}</DialogTitle>
            {description && <DialogDescription>{description}</DialogDescription>}
          </DialogHeader>
          <form
            className="grid gap-4"
            noValidate
            onSubmit={(e) => {
              e.preventDefault();
              submit(e.currentTarget);
            }}
          >
            <FormAlert error={error} />
            {children({ pending, errors })}
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => change(false)} disabled={pending}>
                Отмена
              </Button>
              <Button type="submit" disabled={pending} data-testid={`${testId}-submit`}>
                {pending && <Loader2 className="animate-spin" aria-hidden="true" />}
                {submitLabel}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}

/** Подпись + нативный select/textarea с сообщением об ошибке: общая обёртка для полей без готового компонента. */
export function FieldBox({ id, label, error, hint, children }: { id: string; label: string; error?: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="grid gap-2">
      <label htmlFor={id} className="text-sm leading-none font-medium">
        {label}
      </label>
      {children}
      {hint && !error && <p className="text-xs text-muted-foreground">{hint}</p>}
      {error && (
        <p id={`${id}-error`} role="alert" className="text-xs text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}
