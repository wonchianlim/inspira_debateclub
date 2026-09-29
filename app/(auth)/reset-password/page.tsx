import Link from "next/link";

import { StatePanel } from "@/components/domain/state-panel";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { createUserSupabaseClient } from "@/lib/supabase/server";

import { ResetPasswordForm } from "./reset-password-form";

export const metadata = { title: "设置新密码 · INSPIRA" };

/**
 * 需要一个有效会话才能渲染，因此强制动态渲染、不在构建期预渲染
 * （构建环境可能没有运行时环境变量）。
 */
export const dynamic = "force-dynamic";

export default async function ResetPasswordPage() {
  const supabase = await createUserSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // 没有会话说明用户是直接打开这个地址（而不是从邮件链接进来），
  // 或者链接已过期。给出明确的下一步，而不是一个必然失败的表单。
  if (!user) {
    return (
      <Card>
        <CardContent className="pt-6">
          <StatePanel
            variant="error"
            title="需要先通过邮件链接进入"
            description="这个页面只能从重置密码的邮件链接打开。链接可能已过期或已被使用过。"
            action={
              <Button asChild variant="outline" size="sm">
                <Link href="/forgot-password">重新申请一封邮件</Link>
              </Button>
            }
          />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>设置新密码</CardTitle>
      </CardHeader>
      <CardContent>
        <ResetPasswordForm />
      </CardContent>
    </Card>
  );
}
