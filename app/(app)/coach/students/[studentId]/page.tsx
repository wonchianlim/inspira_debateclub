import Link from "next/link";
import { notFound } from "next/navigation";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { AREA_ROLES } from "@/lib/auth/roles";
import { requireAnyRole } from "@/lib/auth/session";
import { getStudentForCoach, listMyNotesForStudent } from "@/lib/coach/students";

import { CoachNotes } from "./note-form";

export const metadata = { title: "学生详情 · INSPIRA" };
export const dynamic = "force-dynamic";

export default async function CoachStudentPage({
  params,
}: {
  params: Promise<{ studentId: string }>;
}) {
  await requireAnyRole(AREA_ROLES.coach);
  const { studentId } = await params;

  const student = await getStudentForCoach(studentId);
  if (!student) notFound();

  const notes = await listMyNotesForStudent(studentId);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-semibold tracking-tight">{student.displayName}</h1>
        <Button asChild variant="outline" size="sm">
          <Link href="/coach/students">返回学生列表</Link>
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">基本情况</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-x-8 gap-y-2 text-sm">
          <span>
            学校
            <strong className="ml-1">{student.school ?? "（未填）"}</strong>
          </span>
          <span>
            已发布的评分表
            <strong className="ml-1">{student.publishedBallots}</strong>
          </span>
          <span className="flex items-center gap-2">
            参加过的赛制
            {student.formats.length === 0 ? (
              <span className="text-muted-foreground">（暂无）</span>
            ) : (
              student.formats.map((code) => (
                <Badge key={code} variant="outline" className="font-normal">
                  {code}
                </Badge>
              ))
            )}
          </span>
        </CardContent>
      </Card>

      {/*
        ⚠️ 学生自己的成长统计**刻意不在这里显示**。
        `/student/ballots` 上的那份统计是给学生自己看的（规范明确说分数主要用于个人成长、
        且"先不要做公开排名"）。教练看到的是**已发布评分表的数量与赛制**这一类事实，
        而"要不要让教练看到具体分数"是一个产品决策，我没有替产品负责人做。
      */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">私人笔记</CardTitle>
        </CardHeader>
        <CardContent>
          <CoachNotes studentId={studentId} notes={notes} />
        </CardContent>
      </Card>
    </div>
  );
}
