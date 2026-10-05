"use client";

import { useState, useTransition } from "react";
import { Loader2 } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Field, FormAlert } from "@/components/auth/form-parts";
import { inviteUser } from "@/app/(app)/settings/users/actions";
import { APP_ROLES, ROLE_LABELS } from "@/lib/auth/roles";

export function InviteUserDialog({ open, onOpenChange, onDone }: { open: boolean; onOpenChange: (open: boolean) => void; onDone: (message: string) => void }) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | undefined>();
  const [fieldErrors, setFieldErrors] = useState<Record<string, string | undefined>>({});

  function submit(formData: FormData) {
    setError(undefined);
    setFieldErrors({});
    startTransition(async () => {
      const result = await inviteUser({
        email: formData.get("email"),
        fullName: formData.get("fullName"),
        role: formData.get("role"),
      });
      if (result.ok) {
        onOpenChange(false);
        onDone(result.message ?? "Приглашение отправлено.");
      } else {
        setError(result.error);
        setFieldErrors(result.fieldErrors ?? {});
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={(next) => !pending && onOpenChange(next)}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Пригласить пользователя</DialogTitle>
          <DialogDescription>Сотрудник получит письмо со ссылкой и сам задаст пароль. Временный пароль не создаётся.</DialogDescription>
        </DialogHeader>
        <form
          onSubmit={(e) => {
            e.preventDefault(); // не action={}: React 19 очищает поля формы после action, а при ошибке их нужно сохранить
            submit(new FormData(e.currentTarget));
          }}
          className="grid gap-4"
          noValidate
          data-testid="invite-form"
        >
          <FormAlert error={error} />
          <Field id="fullName" label="ФИО" autoComplete="off" placeholder="Иванов Иван Иванович" error={fieldErrors.fullName} disabled={pending} />
          <Field id="email" label="Email" type="email" autoComplete="off" inputMode="email" placeholder="name@farovon.tj" error={fieldErrors.email} disabled={pending} />
          <div className="grid gap-2">
            <Label htmlFor="role">Роль</Label>
            <Select id="role" name="role" defaultValue="VIEWER" disabled={pending} aria-invalid={fieldErrors.role ? true : undefined}>
              {APP_ROLES.map((r) => (
                <option key={r} value={r}>
                  {ROLE_LABELS[r]}
                </option>
              ))}
            </Select>
            {fieldErrors.role && <p className="text-xs text-destructive">{fieldErrors.role}</p>}
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={pending}>
              Отмена
            </Button>
            <Button type="submit" disabled={pending}>
              {pending && <Loader2 className="animate-spin" aria-hidden="true" />}
              Отправить приглашение
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
