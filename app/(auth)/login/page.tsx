import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

import { LoginForm } from "./login-form";

export const metadata = { title: "登录 · INSPIRA" };

/**
 * 登录页。
 *
 * `searchParams.error` 由 `/auth/confirm` 在邮件链接失效时写入。
 * 这里把技术性的错误码翻译成用户能理解的中文提示。
 */
const LINK_ERRORS: Record<string, string> = {
  "invalid-link": "这个链接不完整。请重新申请一封重置密码的邮件。",
  "link-expired": "这个链接已失效或已被使用过。请重新申请一封重置密码的邮件。",
};

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;
  const linkError = error ? (LINK_ERRORS[error] ?? "链接无效，请重试。") : undefined;

  return (
    <Card>
      <CardHeader>
        <CardTitle>登录</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {linkError ? (
          <p role="alert" className="text-destructive text-sm">
            {linkError}
          </p>
        ) : null}
        <LoginForm />
      </CardContent>
    </Card>
  );
}
