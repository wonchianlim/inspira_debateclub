import Link from "next/link";

import { MetaChip } from "@/components/domain/meta-chip";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export const metadata = { title: "学生区域 · INSPIRA" };

export const dynamic = "force-dynamic";

/**
 * 学生区域入口。
 *
 * 只列出**已经可用**的功能；未完成的明确标出所属阶段 ——
 * 不给"点进去发现是空的"的链接。
 */
type StudentSection =
  | { title: string; description: string; ready: true; href: string }
  | { title: string; description: string; ready: false; phase: string };

const STUDENT_SECTIONS: StudentSection[] = [
  {
    title: "活动报名",
    description: "查看可报名的活动、报名或取消、选择想参加的赛制并排序。",
    ready: true,
    href: "/student/events",
  },
  {
    title: "搭档请求",
    description: "用搭档码邀请同学（在活动详情页里），被接受后是配对时的强烈偏好。",
    ready: true,
    href: "/student/events",
  },
  {
    title: "签到",
    description: "活动开始前签到。",
    ready: false,
    phase: "Phase 6",
  },
  {
    title: "我的评分表",
    description: "查看已发布的评分表。",
    ready: false,
    phase: "Phase 7",
  },
  {
    title: "我的历史",
    description: "参加过的比赛与成绩记录。",
    ready: false,
    phase: "Phase 8",
  },
];

export default function StudentAreaPage() {
  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-xl font-semibold tracking-tight">学生区域</h1>

      <div className="grid gap-4 sm:grid-cols-2">
        {STUDENT_SECTIONS.map((section) => (
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
