import Link from "next/link";

import { MetaChip } from "@/components/domain/meta-chip";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export const metadata = { title: "俱乐部管理 · INSPIRA" };

export const dynamic = "force-dynamic";

/**
 * 俱乐部管理入口。
 *
 * 只列出**已经可用**的功能；未完成的明确标出所属阶段 ——
 * 不给"点进去发现是空的"的链接，也不假装已经做完。
 */
type ManageSection =
  | { title: string; description: string; ready: true; href: string }
  | { title: string; description: string; ready: false; phase: string };

const MANAGE_SECTIONS: ManageSection[] = [
  {
    title: "活动管理",
    description: "创建、修改、克隆活动，设置活动启用哪些赛制，推进活动状态。",
    ready: true,
    href: "/manage/events",
  },
  {
    title: "通知管理",
    description: "发布面向全体、某个活动、某个角色或某个赛制的通知。",
    ready: true,
    href: "/manage/notices",
  },
  {
    title: "报名管理",
    description: "查看与人工修正学生报名、标记未到场、按搭档码补报名。",
    ready: true,
    href: "/manage/events",
  },
  {
    title: "配对与队伍提案",
    description: "按赛制偏好与评分生成队伍、查看取舍说明、锁定或解散队伍、确认提案。",
    ready: true,
    href: "/manage/events",
  },
  {
    title: "比赛、房间与裁判指派",
    description: "生成比赛与正反方、分配房间、发布名单、开始比赛。",
    ready: true,
    href: "/manage/events",
  },
];

export default function ManageHomePage() {
  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-xl font-semibold tracking-tight">俱乐部管理</h1>

      <div className="grid gap-4 sm:grid-cols-2">
        {MANAGE_SECTIONS.map((section) => (
          <Card key={section.title}>
            <CardHeader>
              <CardTitle className="flex flex-wrap items-center gap-2 text-base">
                {section.title}
                {section.ready ? null : <MetaChip>待建设 · {section.phase}</MetaChip>}
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
