"use client";

import Link from "next/link";
import { useActionState } from "react";

import { FormField, describedBy } from "@/components/domain/form-field";
import { FormMessage } from "@/components/domain/form-message";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { INITIAL_AUTH_STATE, signInAction } from "@/lib/auth/actions";

export function LoginForm() {
  const [state, formAction, pending] = useActionState(signInAction, INITIAL_AUTH_STATE);

  const emailError = state.fieldErrors?.email?.[0];
  const passwordError = state.fieldErrors?.password?.[0];

  return (
    <form action={formAction} className="flex flex-col gap-4" noValidate>
      <FormMessage status={state.status} message={state.message} />

      <FormField id="email" label="邮箱" error={emailError}>
        <Input
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          required
          aria-invalid={emailError ? true : undefined}
          aria-describedby={describedBy("email", { error: emailError })}
        />
      </FormField>

      <FormField id="password" label="密码" error={passwordError}>
        <Input
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
          required
          aria-invalid={passwordError ? true : undefined}
          aria-describedby={describedBy("password", { error: passwordError })}
        />
      </FormField>

      <Button type="submit" disabled={pending}>
        {pending ? "登录中…" : "登录"}
      </Button>

      <div className="text-muted-foreground flex flex-wrap justify-between gap-2 text-sm">
        <Link href="/register" className="focus-visible:ring-ring/50 rounded focus-visible:ring-3">
          还没有账号？注册
        </Link>
        <Link
          href="/forgot-password"
          className="focus-visible:ring-ring/50 rounded focus-visible:ring-3"
        >
          忘记密码？
        </Link>
      </div>
    </form>
  );
}
