"use client";

import Link from "next/link";
import { useActionState, useState } from "react";

import { FormField, describedBy } from "@/components/domain/form-field";
import { FormMessage } from "@/components/domain/form-message";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { INITIAL_AUTH_STATE } from "@/lib/auth/form-state";
import { signInAction } from "@/lib/auth/actions";
import { useMessages } from "@/lib/i18n/provider";

export function LoginForm() {
  const m = useMessages();
  const [state, formAction, pending] = useActionState(signInAction, INITIAL_AUTH_STATE);

  /*
   * 密码显示／隐藏（规范 §7.1 明确要求 `Password` with show/hide button）。
   *
   * 用 `type="button"` 且带 `aria-pressed`：它是一个**开关**，
   * 而不是一个会提交表单的按钮 —— 后者会让"想看看自己输错了什么"变成一次登录尝试。
   */
  const [passwordVisible, setPasswordVisible] = useState(false);

  const emailError = state.fieldErrors?.email?.[0];
  const passwordError = state.fieldErrors?.password?.[0];

  return (
    <form action={formAction} className="flex flex-col gap-4" noValidate>
      <FormMessage status={state.status} message={state.message} />

      <FormField id="email" label={m.auth.email} error={emailError}>
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

      <FormField id="password" label={m.auth.password} error={passwordError}>
        <div className="flex items-center gap-2">
          <Input
            id="password"
            name="password"
            type={passwordVisible ? "text" : "password"}
            autoComplete="current-password"
            required
            aria-invalid={passwordError ? true : undefined}
            aria-describedby={describedBy("password", { error: passwordError })}
          />
          <Button
            type="button"
            variant="outline"
            size="sm"
            aria-pressed={passwordVisible}
            onClick={() => setPasswordVisible((visible) => !visible)}
          >
            {passwordVisible ? m.auth.hidePassword : m.auth.showPassword}
          </Button>
        </div>
      </FormField>

      <Button type="submit" disabled={pending}>
        {pending ? m.auth.signingIn : m.auth.signInButton}
      </Button>

      <div className="text-muted-foreground flex flex-wrap justify-between gap-2 text-sm">
        {/*
          规范 §7.1："Conditional footer: `New to Debate Club? Create an account`
          **only when registration is enabled**."
          ⚠️ 系统里**没有**"是否开放注册"这个开关（没有设置项、数据库里也没有）。
          因此这里照常显示 —— 注册确实可用。要不要加开关是产品决定，
          记在 NEXT_STEP.md 里。
        */}
        <Link href="/register" className="focus-visible:ring-ring/50 rounded focus-visible:ring-3">
          {m.auth.noAccount}
          {m.auth.registerLink}
        </Link>
        <Link
          href="/forgot-password"
          className="focus-visible:ring-ring/50 rounded focus-visible:ring-3"
        >
          {m.auth.forgotPasswordLink}
        </Link>
      </div>
    </form>
  );
}
