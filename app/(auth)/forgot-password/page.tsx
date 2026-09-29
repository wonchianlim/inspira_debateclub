import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

import { ForgotPasswordForm } from "./forgot-password-form";

export const metadata = { title: "忘记密码 · INSPIRA" };

export default function ForgotPasswordPage() {
  return (
    <Card>
      <CardHeader>
        <CardTitle>忘记密码</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <p className="text-muted-foreground text-sm">
          输入你的注册邮箱，我们会发送一封重置密码的邮件。
        </p>
        <ForgotPasswordForm />
      </CardContent>
    </Card>
  );
}
