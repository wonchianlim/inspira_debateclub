import Link from "next/link";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { AREA_ROLES } from "@/lib/auth/roles";
import { requireAnyRole } from "@/lib/auth/session";
import { listStudentsForCoach, listMyNotesForStudent } from "@/lib/coach/students";

export const metadata = { title: "教练区域 · INSPIRA" };
export const dynamic = "force-dynamic";

export default async function CoachAreaPage() {
  await requireAnyRole(AREA_ROLES.coach);
  const students = await listStudentsForCoach();

  /*
   * 只统计"我写过笔记的学生数"，而不是把笔记读出来 ——
   * 教练首页不需要笔记内容，只需要知道哪些学生已经有记录。
   */
  const withNotes = (
    await Promise.all(
      students.map(async (student) => ({
        student,
        notes: (await listMyNotesForStudent(student.studentId)).length,
      })),
    )
  ).filter((entry) => entry.notes > 0);

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-xl font-semibold tracking-tight">教练区域</h1>

      <p className="text-muted-foreground text-sm">
        按已确认的结论（PERM-D-2），教练对**评分**是只读的 —— 你在这里看到的是学生的
        参赛情况，改分需要管理员走重开流程。
      </p>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">学生与笔记</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-3 text-sm">
          <p>
            社里共 {students.length} 位学生
            {withNotes.length > 0 ? `，你给其中 ${withNotes.length} 位写过笔记` : ""}。
          </p>
          <p className="text-muted-foreground text-xs">
            笔记**只有你自己能看到** —— 管理员、其他教练、学生都看不到。
          </p>
          <Button asChild size="sm" className="self-start">
            <Link href="/coach/students">查看学生列表</Link>
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
