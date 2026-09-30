import Link from "next/link";

import { StatePanel } from "@/components/domain/state-panel";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { AREA_ROLES } from "@/lib/auth/roles";
import { requireAnyRole } from "@/lib/auth/session";
import { listStudentsForCoach } from "@/lib/coach/students";

export const metadata = { title: "学生 · INSPIRA" };
export const dynamic = "force-dynamic";

export default async function CoachStudentsPage() {
  await requireAnyRole(AREA_ROLES.coach);
  const students = await listStudentsForCoach();

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-semibold tracking-tight">学生</h1>
        <Button asChild variant="outline" size="sm">
          <Link href="/coach">返回教练区域</Link>
        </Button>
      </div>

      {students.length === 0 ? (
        <StatePanel
          variant="empty"
          title="目前没有学生档案"
          description="学生注册后就会出现在这里。"
        />
      ) : (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">全部学生（{students.length} 位）</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-2">
            <p className="text-muted-foreground text-xs">
              目前显示的是**全社的学生** —— 系统里还没有「教练带哪些学生」的关联，
              因此无法只列出你带的学生。
            </p>
            {students.map((student) => (
              <div
                key={student.studentId}
                className="border-border flex flex-wrap items-center justify-between gap-2 rounded-md border px-3 py-2"
              >
                <div className="flex flex-col">
                  <strong className="text-sm">{student.displayName}</strong>
                  <span className="text-muted-foreground text-xs">
                    {student.school ?? "（未填学校）"}
                  </span>
                </div>
                <Button asChild size="sm" variant="outline">
                  <Link href={`/coach/students/${student.studentId}`}>查看与记笔记</Link>
                </Button>
              </div>
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
