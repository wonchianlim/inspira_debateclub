"use client";

import { useActionState } from "react";

import { FormField, describedBy } from "@/components/domain/form-field";
import { FormMessage } from "@/components/domain/form-message";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { INITIAL_AUTH_STATE } from "@/lib/auth/form-state";
import { updatePasswordAction } from "@/lib/auth/actions";

export function ResetPasswordForm() {
  const [state, formAction, pending] = useActionState(updatePasswordAction, INITIAL_AUTH_STATE);

  const passwordError = state.fieldErrors?.password?.[0];
  const confirmError = state.fieldErrors?.confirmPassword?.[0];

  return (
    <form action={formAction} className="flex flex-col gap-4" noValidate>
      <FormMessage status={state.status} message={state.message} />

      <FormField
        id="password"
        label="新密码"
        error={passwordError}
        hint="至少 8 位。设置后需要用新密码重新登录其他设备。"
      >
        <Input
          id="password"
          name="password"
          type="password"
          autoComplete="new-password"
          required
          aria-invalid={passwordError ? true : undefined}
          aria-describedby={describedBy("password", {
            error: passwordError,
            hint: "hint",
          })}
        />
      </FormField>

      <FormField id="confirmPassword" label="再输入一次" error={confirmError}>
        <Input
          id="confirmPassword"
          name="confirmPassword"
          type="password"
          autoComplete="new-password"
          required
          aria-invalid={confirmError ? true : undefined}
          aria-describedby={describedBy("confirmPassword", { error: confirmError })}
        />
      </FormField>

      <Button type="submit" disabled={pending}>
        {pending ? "保存中…" : "设置新密码"}
      </Button>
    </form>
  );
}
