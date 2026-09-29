import Link from "next/link";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export const metadata = { title: "系统管理 · INSPIRA" };

export const dynamic = "force-dynamic";

/**
 * 系统管理入口。
 *
 * 只列出**已经可用**的功能，未完成的明确标出所属阶段 ——
 * 不给"点进去发现是空的"的链接，也不假装已经做完。
 */
const ADMIN_SECTIONS = [
  {
    href: "/admin/users",
    title: "用户管理",
    description: "查看账号、修改账号状态、授予或撤销角色。",
    ready: true,
  },
  {
    href: "/admin/judges",
    title: "裁判审批",
    description: "审批裁判申请、维护裁判的各赛制资格。",
    ready: true,
  },
  {
    href: "/admin/settings",
    title: "系统设置",
    description: "维护系统级键值（例如默认报名时间偏移）。",
    ready: true,
  },
  {
    href: "/admin/audit",
    title: "审计日志",
    description: "查看谁在什么时候改了什么。",
    ready: false,
    phase: "P2-10",
  },
] as const;

export default function AdminHomePage() {
  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-xl font-semibold tracking-tight">系统管理</h1>

      <div className="grid gap-4 sm:grid-cols-2">
        {ADMIN_SECTIONS.map((section) => (
          <Card key={section.href}>
            <CardHeader>
              <CardTitle className="flex flex-wrap items-center gap-2 text-base">
                {section.title}
                {section.ready ? null : (
                  <Badge variant="outline" className="font-normal">
                    待建设 · {section.phase}
                  </Badge>
                )}
              </CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-3">
              <p className="text-muted-foreground text-sm">{section.description}</p>
              {section.ready ? (
                <Button asChild size="sm" className="self-start">
                  <Link href={section.href}>进入</Link>
                </Button>
              ) : (
                <p className="text-muted-foreground text-xs">此功能尚未建设，暂不能进入。</p>
              )}
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
