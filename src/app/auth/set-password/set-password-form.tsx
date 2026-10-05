"use client";

import { useActionState } from "react";
import { Loader2 } from "lucide-react";
import { setPassword } from "./actions";
import { Button } from "@/components/ui/button";
import { Field, FormAlert } from "@/components/auth/form-parts";
import { MIN_PASSWORD_LENGTH, type FormState } from "@/lib/users/schemas";

const initial: FormState = {};

export function SetPasswordForm() {
  const [state, action, pending] = useActionState(setPassword, initial);
  return (
    <form action={action} className="flex flex-col gap-4" noValidate data-testid="set-password-form">
      <FormAlert error={state.error} />
      <Field id="password" label="Новый пароль" type="password" autoComplete="new-password" hint={`Не короче ${MIN_PASSWORD_LENGTH} символов`} error={state.fieldErrors?.password} disabled={pending} />
      <Field id="confirm" label="Повторите пароль" type="password" autoComplete="new-password" error={state.fieldErrors?.confirm} disabled={pending} />
      <Button type="submit" size="lg" className="w-full" disabled={pending}>
        {pending && <Loader2 className="animate-spin" aria-hidden="true" />}
        {pending ? "Сохранение…" : "Сохранить пароль и войти"}
      </Button>
    </form>
  );
}
