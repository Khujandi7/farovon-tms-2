"use client";

import { useState, useTransition } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { FormAlert } from "@/components/auth/form-parts";
import { useToast } from "./toast";

type Outcome = { ok: true; message?: string } | { ok: false; error: string };

/**
 * Подтверждение существенного действия с обязательной причиной (удаление, архив, откат, сторно...).
 * Причина уходит в audit_log. Закрывается только после успешного ответа сервера.
 */
export function ReasonDialog({
  open,
  title,
  description,
  confirmLabel,
  destructive,
  reasonLabel = "Причина",
  reasonRequired = true,
  children,
  onClose,
  onConfirm,
  onDone,
  testId = "reason-dialog",
}: {
  open: boolean;
  title: string;
  description?: React.ReactNode;
  confirmLabel: string;
  destructive?: boolean;
  reasonLabel?: string;
  reasonRequired?: boolean;
  children?: React.ReactNode;
  onClose: () => void;
  onConfirm: (reason: string) => Promise<Outcome>;
  onDone?: () => void;
  testId?: string;
}) {
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | undefined>();
  const [pending, startTransition] = useTransition();
  const { notify } = useToast();

  function close() {
    if (pending) return;
    setReason("");
    setError(undefined);
    onClose();
  }

  function submit() {
    setError(undefined);
    if (reasonRequired && reason.trim().length < 3) {
      setError("Укажите причину (не короче 3 символов).");
      return;
    }
    startTransition(async () => {
      const result = await onConfirm(reason.trim());
      if (result.ok) {
        notify(true, result.message ?? "Готово.");
        setReason("");
        onClose();
        onDone?.();
      } else {
        setError(result.error);
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && close()}>
      <DialogContent data-testid={testId}>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          {description && <DialogDescription>{description}</DialogDescription>}
        </DialogHeader>
        <form
          className="grid gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            submit();
          }}
        >
          <FormAlert error={error} />
          {children}
          <div className="grid gap-2">
            <Label htmlFor={`${testId}-reason`}>
              {reasonLabel}
              {reasonRequired ? "" : " (необязательно)"}
            </Label>
            <Textarea id={`${testId}-reason`} name="reason" value={reason} onChange={(e) => setReason(e.target.value)} rows={3} disabled={pending} placeholder="Например: ошибка ввода, решение руководителя…" />
            <p className="text-xs text-muted-foreground">Причина сохраняется в журнале изменений вместе с автором и временем.</p>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={close} disabled={pending}>
              Отмена
            </Button>
            <Button type="submit" variant={destructive ? "destructive" : "default"} disabled={pending}>
              {pending && <Loader2 className="animate-spin" aria-hidden="true" />}
              {confirmLabel}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
