"use client";

import { useState, useTransition } from "react";
import { Loader2 } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { FormAlert } from "@/components/auth/form-parts";
import { changeRole } from "@/app/(app)/settings/users/actions";
import { APP_ROLES, ROLE_LABELS } from "@/lib/auth/roles";
import type { UserRow } from "@/lib/users/types";

export function ChangeRoleDialog({ target, onClose, onDone }: { target: UserRow | null; onClose: () => void; onDone: (message: string) => void }) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | undefined>();

  function submit(formData: FormData) {
    if (!target) return;
    setError(undefined);
    startTransition(async () => {
      const result = await changeRole({ userId: target.id, role: formData.get("role") });
      if (result.ok) {
        onClose();
        onDone(`${target.fullName}: ${result.message ?? "роль изменена."}`);
      } else {
        setError(result.error);
      }
    });
  }

  return (
    <Dialog open={target !== null} onOpenChange={(open) => !open && !pending && (setError(undefined), onClose())}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Изменить роль</DialogTitle>
          <DialogDescription>{target?.fullName}. Права меняются сразу, при следующем запросе пользователя.</DialogDescription>
        </DialogHeader>
        {target && (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              submit(new FormData(e.currentTarget));
            }}
            className="grid gap-4"
            key={target.id}
            data-testid="role-form"
          >
            <FormAlert error={error} />
            <div className="grid gap-2">
              <Label htmlFor="change-role">Роль</Label>
              <Select id="change-role" name="role" defaultValue={target.role} disabled={pending}>
                {APP_ROLES.map((r) => (
                  <option key={r} value={r}>
                    {ROLE_LABELS[r]}
                  </option>
                ))}
              </Select>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={onClose} disabled={pending}>
                Отмена
              </Button>
              <Button type="submit" disabled={pending}>
                {pending && <Loader2 className="animate-spin" aria-hidden="true" />}
                Сохранить
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
