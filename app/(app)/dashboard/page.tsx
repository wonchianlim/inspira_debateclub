import Link from "next/link";

import { StatePanel } from "@/components/domain/state-panel";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ROLE_LABELS, primaryRole, ROLE_LANDING } from "@/lib/auth/roles";
import { requireSession } from "@/lib/auth/session";
import { redirect } from "next/navigation";

export const metadata = { title: "概览 · INSPIRA" };

export const dynamic = "force-dynamic";

/**
 * 概览页 = 角色感知的跳转点（规范第 8 节："role-aware redirect/overview"）。
 *
 * 一个账号可能有多个角色，因此这里按**权限优先级**跳到最高权限区域
 * （见 lib/auth/roles.ts 的 ROLE_PRECEDENCE）。导航里仍然保留他拥有的全部区域入口。
 *
 * 若账号一个角色都没有（例如初始授权那一步失败），**不跳转**——
 * 否则会与"跳到自己没有权限的区域 → 403"形成循环。这里给出可执行的下一步。
 */
export default async function DashboardPage() {
  const session = await requireSession();
  const primary = primaryRole(session.roles);

  if (!primary) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>账号还在初始化中</CardTitle>
        </CardHeader>
        <CardContent>
          <StatePanel
            variant="empty"
            title="你的账号还没有被分配角色"
            description="这通常发生在注册流程的最后一步没有完成时。请联系俱乐部管理员为你分配角色，然后重新登录。"
            action={
              <Button asChild variant="outline" size="sm">
                <Link href="/">返回首页</Link>
              </Button>
            }
          />
        </CardContent>
      </Card>
    );
  }

  // 拥有多个角色时，在概览页简短说明"你还有哪些区域可以进入"，
  // 避免用户以为只有被跳转过去的那个身份。
  if (session.roles.length > 1) {
    const others = session.roles.filter((role) => role !== primary);
    return (
      <Card>
        <CardHeader>
          <CardTitle>你的账号拥有多个角色</CardTitle>
        </CardHeader>
        <CardContent className="text-muted-foreground flex flex-col gap-2 text-sm">
          <p>
            主要身份：<strong className="text-foreground">{ROLE_LABELS[primary]}</strong>
          </p>
          <p>
            其他身份：
            {others.map((role) => ROLE_LABELS[role]).join("、")}
          </p>
          <p>
            可以从上方导航进入各区域的入口，或直接前往{" "}
            <Link
              href={ROLE_LANDING[primary]}
              className="focus-visible:ring-ring/50 rounded underline focus-visible:ring-3"
            >
              {ROLE_LABELS[primary]}区域
            </Link>
            。
          </p>
        </CardContent>
      </Card>
    );
  }

  redirect(ROLE_LANDING[primary]);
}
