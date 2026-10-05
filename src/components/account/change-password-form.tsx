"use client";

import { useActionState } from "react";
import { Loader2 } from "lucide-react";
import { changeOwnPassword } from "@/app/(app)/settings/actions";
import { Button } from "@/components/ui/button";
import { Field, FormAlert, FormSuccess } from "@/components/auth/form-parts";
import { MIN_PASSWORD_LENGTH, type FormState } from "@/lib/users/schemas";

const initial: FormState = {};

export function ChangePasswordForm() {
  const [state, action, pending] = useActionState(changeOwnPassword, initial);
  return (
    <form action={action} className="grid max-w-sm gap-4" noValidate data-testid="change-password-form" key={state.ok ? "done" : "form"}>
      <FormAlert error={state.error} />
      <FormSuccess message={state.message} />
      <Field id="current" label="Текущий пароль" type="password" autoComplete="current-password" error={state.fieldErrors?.current} disabled={pending} />
      <Field id="password" label="Новый пароль" type="password" autoComplete="new-password" hint={`Не короче ${MIN_PASSWORD_LENGTH} символов`} error={state.fieldErrors?.password} disabled={pending} />
      <Field id="confirm" label="Повторите новый пароль" type="password" autoComplete="new-password" error={state.fieldErrors?.confirm} disabled={pending} />
      <div>
        <Button type="submit" disabled={pending}>
          {pending && <Loader2 className="animate-spin" aria-hidden="true" />}
          Изменить пароль
        </Button>
      </div>
    </form>
  );
}
