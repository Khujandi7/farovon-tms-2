"use client";

import { useActionState } from "react";
import { AlertCircle, Loader2 } from "lucide-react";
import { signIn } from "@/app/(auth)/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { LoginState } from "@/lib/auth/schemas";

const initialState: LoginState = {};

export function LoginForm({ next }: { next?: string }) {
  const [state, formAction, pending] = useActionState(signIn, initialState);

  return (
    <form action={formAction} className="flex flex-col gap-4" noValidate data-testid="login-form">
      {next && <input type="hidden" name="next" value={next} />}

      {state.error && (
        <div role="alert" className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2.5 text-sm text-destructive">
          <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          <span>{state.error}</span>
        </div>
      )}

      <div className="grid gap-2">
        <Label htmlFor="email">Email</Label>
        <Input
          id="email"
          name="email"
          type="email"
          autoComplete="username"
          inputMode="email"
          placeholder="name@farovon.tj"
          defaultValue={state.email}
          aria-invalid={state.fieldErrors?.email ? true : undefined}
          aria-describedby={state.fieldErrors?.email ? "email-error" : undefined}
          disabled={pending}
        />
        {state.fieldErrors?.email && (
          <p id="email-error" className="text-xs text-destructive">
            {state.fieldErrors.email}
          </p>
        )}
      </div>

      <div className="grid gap-2">
        <Label htmlFor="password">Пароль</Label>
        <Input
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
          aria-invalid={state.fieldErrors?.password ? true : undefined}
          aria-describedby={state.fieldErrors?.password ? "password-error" : undefined}
          disabled={pending}
        />
        {state.fieldErrors?.password && (
          <p id="password-error" className="text-xs text-destructive">
            {state.fieldErrors.password}
          </p>
        )}
      </div>

      <Button type="submit" size="lg" className="mt-1 w-full" disabled={pending}>
        {pending && <Loader2 className="animate-spin" aria-hidden="true" />}
        {pending ? "Вход…" : "Войти"}
      </Button>
    </form>
  );
}
