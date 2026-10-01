import { getMessages } from "@/lib/i18n";

import { LoginForm } from "./login-form";

export const metadata = { title: "登录 · INSPIRA" };

/**
 * 登录页（UI/UX 规范 §7.1）。
 *
 * `searchParams.error` 由 `/auth/confirm` 在邮件链接失效时写入。
 * 文案来自 i18n 字典 —— 默认语言是英文（产品负责人 2026-10-01 决定），
 * 因此这里**不再写死中文**（此前整组 `auth` 文案躺在字典里没人用）。
 */
export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const [m, { error }] = await Promise.all([getMessages(), searchParams]);

  const linkError =
    error === "invalid-link"
      ? m.auth.linkInvalid
      : error === "link-expired"
        ? m.auth.linkExpired
        : error
          ? m.auth.linkInvalid
          : undefined;

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-h2 font-semibold tracking-tight">{m.auth.signInHeading}</h1>
        <p className="text-muted-foreground mt-1 text-sm">{m.auth.signInSupporting}</p>
      </div>

      {linkError ? (
        <p role="alert" className="text-destructive text-sm">
          {linkError}
        </p>
      ) : null}

      <LoginForm />
    </div>
  );
}
