"use client";

import Link from "next/link";
import { useActionState } from "react";

import { FormField, describedBy } from "@/components/domain/form-field";
import { FormMessage } from "@/components/domain/form-message";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { INITIAL_AUTH_STATE } from "@/lib/auth/form-state";
import { signUpAction } from "@/lib/auth/actions";

/**
 * 注册表单。
 *
 * 身份选择使用**原生 select** 而不是自建的弹出式下拉：
 *   原生控件在键盘操作、移动端与屏幕阅读器下表现最稳定，
 *   且在没有 JavaScript 时依然可用（主规格第 13 节的可访问性要求）。
 *
 * ⚠️ 可以自助选择的只有「学生」与「裁判」。教练、俱乐部管理员、超级管理员
 *    必须由管理员授予，不能自助注册（主规格第 4 节权限矩阵）。
 *    裁判注册后进入「待批准」状态，需管理员批准后才可被指派。
 */
export function RegisterForm() {
  const [state, formAction, pending] = useActionState(signUpAction, INITIAL_AUTH_STATE);

  const errors = state.fieldErrors ?? {};
  const firstError = (name: string) => errors[name]?.[0];

  return (
    <form action={formAction} className="flex flex-col gap-4" noValidate>
      <FormMessage status={state.status} message={state.message} />

      <div className="grid grid-cols-2 gap-3">
        <FormField id="lastName" label="姓" error={firstError("lastName")}>
          <Input
            id="lastName"
            name="lastName"
            autoComplete="family-name"
            required
            aria-invalid={firstError("lastName") ? true : undefined}
            aria-describedby={describedBy("lastName", { error: firstError("lastName") })}
          />
        </FormField>

        <FormField id="firstName" label="名" error={firstError("firstName")}>
          <Input
            id="firstName"
            name="firstName"
            autoComplete="given-name"
            required
            aria-invalid={firstError("firstName") ? true : undefined}
            aria-describedby={describedBy("firstName", { error: firstError("firstName") })}
          />
        </FormField>
      </div>

      <FormField id="email" label="邮箱" error={firstError("email")}>
        <Input
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          required
          aria-invalid={firstError("email") ? true : undefined}
          aria-describedby={describedBy("email", { error: firstError("email") })}
        />
      </FormField>

      <FormField
        id="password"
        label="密码"
        error={firstError("password")}
        hint="至少 8 位。建议用一个只在这里使用的长密码。"
      >
        <Input
          id="password"
          name="password"
          type="password"
          autoComplete="new-password"
          required
          aria-invalid={firstError("password") ? true : undefined}
          aria-describedby={describedBy("password", {
            error: firstError("password"),
            hint: "hint",
          })}
        />
      </FormField>

      <FormField id="role" label="身份" error={firstError("role")}>
        <select
          id="role"
          name="role"
          defaultValue="student"
          required
          aria-invalid={firstError("role") ? true : undefined}
          aria-describedby={describedBy("role", { error: firstError("role") })}
          className="border-input bg-background focus-visible:border-ring focus-visible:ring-ring/50 h-9 w-full rounded-md border px-3 text-sm focus-visible:ring-3 focus-visible:outline-none"
        >
          <option value="student">学生</option>
          <option value="judge">裁判（需要管理员批准）</option>
        </select>
      </FormField>

      <Button type="submit" disabled={pending}>
        {pending ? "注册中…" : "注册"}
      </Button>

      <p className="text-muted-foreground text-sm">
        已有账号？{" "}
        <Link href="/login" className="focus-visible:ring-ring/50 rounded focus-visible:ring-3">
          去登录
        </Link>
      </p>
    </form>
  );
}
