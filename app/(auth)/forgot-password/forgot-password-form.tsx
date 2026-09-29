"use client";

import Link from "next/link";
import { useActionState } from "react";

import { FormField, describedBy } from "@/components/domain/form-field";
import { FormMessage } from "@/components/domain/form-message";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { INITIAL_AUTH_STATE } from "@/lib/auth/form-state";
import { requestPasswordResetAction } from "@/lib/auth/actions";

export function ForgotPasswordForm() {
  const [state, formAction, pending] = useActionState(
    requestPasswordResetAction,
    INITIAL_AUTH_STATE,
  );

  const emailError = state.fieldErrors?.email?.[0];

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

      <Button type="submit" disabled={pending}>
        {pending ? "发送中…" : "发送重置邮件"}
      </Button>

      <p className="text-muted-foreground text-sm">
        <Link href="/login" className="focus-visible:ring-ring/50 rounded focus-visible:ring-3">
          返回登录
        </Link>
      </p>
    </form>
  );
}
