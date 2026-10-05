"use client";

import { useActionState } from "react";
import { Loader2 } from "lucide-react";
import { requestPasswordReset } from "./actions";
import { Button } from "@/components/ui/button";
import { Field, FormAlert, FormSuccess } from "@/components/auth/form-parts";
import type { FormState } from "@/lib/users/schemas";

const initial: FormState = {};

export function ForgotPasswordForm() {
  const [state, action, pending] = useActionState(requestPasswordReset, initial);
  return (
    <form action={action} className="flex flex-col gap-4" noValidate data-testid="forgot-form">
      <FormAlert error={state.error} />
      <FormSuccess message={state.message} />
      {!state.ok && (
        <>
          <Field id="email" label="Email" type="email" autoComplete="username" inputMode="email" placeholder="name@farovon.tj" error={state.fieldErrors?.email} disabled={pending} />
          <Button type="submit" size="lg" className="w-full" disabled={pending}>
            {pending && <Loader2 className="animate-spin" aria-hidden="true" />}
            {pending ? "Отправка…" : "Отправить ссылку"}
          </Button>
        </>
      )}
    </form>
  );
}
