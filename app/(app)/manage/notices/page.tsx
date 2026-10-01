import Link from "next/link";

import { StatePanel } from "@/components/domain/state-panel";
import { StatusBadge } from "@/components/domain/status-badge";
import { noticeStatusTone } from "@/components/domain/status-tone";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { listNotices, noticeStatusOf } from "@/lib/admin/notices";
import { ROLE_LABELS, type AppRole } from "@/lib/auth/roles";
import { utcToZonedLocal } from "@/lib/domain/timezone";
import { CLUB_DEFAULT_TIMEZONE } from "@/lib/domain/timezone";
import { NOTICE_AUDIENCE_LABELS } from "@/lib/validation/notices";

export const metadata = { title: "通知管理 · INSPIRA" };

export const dynamic = "force-dynamic";

const STATUS_LABELS = {
  draft: "草稿",
  scheduled: "定时发布",
  published: "已发布",
  expired: "已过期",
} as const;

export default async function ManageNoticesPage() {
  const notices = await listNotices();

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-semibold tracking-tight">通知管理</h1>
        <div className="flex gap-2">
          <Button asChild variant="outline" size="sm">
            <Link href="/manage">返回俱乐部管理</Link>
          </Button>
          <Button asChild size="sm">
            <Link href="/manage/notices/new">新建通知</Link>
          </Button>
        </div>
      </div>

      <p className="text-muted-foreground text-sm">
        ⚠️ 本阶段的通知只出现在系统内部（登录后可见）。
        <strong>电子邮件投递将在 Phase 9 实现</strong>。
      </p>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">共 {notices.length} 条通知</CardTitle>
        </CardHeader>
        <CardContent>
          {notices.length === 0 ? (
            <StatePanel
              variant="empty"
              title="还没有通知"
              description="点右上角「新建通知」发布第一条。可以先存成草稿，确认内容后再发布。"
            />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <caption className="sr-only">通知列表，包含标题、接收对象、状态与发布时间</caption>
                <thead>
                  <tr className="border-border border-b text-left">
                    <th scope="col" className="py-2 pr-4 font-medium">
                      标题
                    </th>
                    <th scope="col" className="py-2 pr-4 font-medium">
                      接收对象
                    </th>
                    <th scope="col" className="py-2 pr-4 font-medium">
                      状态
                    </th>
                    <th scope="col" className="py-2 pr-4 font-medium">
                      发布时间
                    </th>
                    <th scope="col" className="py-2 font-medium">
                      操作
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {notices.map((notice) => {
                    const status = noticeStatusOf(notice);
                    const target =
                      notice.audienceType === "event"
                        ? (notice.eventTitle ?? "（活动已删除）")
                        : notice.audienceType === "role" && notice.role
                          ? (ROLE_LABELS[notice.role as AppRole] ?? notice.role)
                          : notice.audienceType === "format"
                            ? (notice.formatCode ?? "（赛制未知）")
                            : "";
                    return (
                      <tr key={notice.id} className="border-border border-b last:border-0">
                        <td className="py-3 pr-4">{notice.title}</td>
                        <td className="py-3 pr-4">
                          {NOTICE_AUDIENCE_LABELS[notice.audienceType] ?? notice.audienceType}
                          {target ? (
                            <span className="text-muted-foreground"> · {target}</span>
                          ) : null}
                        </td>
                        <td className="py-3 pr-4">
                          <StatusBadge tone={noticeStatusTone(status)}>
                            {STATUS_LABELS[status]}
                          </StatusBadge>
                        </td>
                        <td className="py-3 pr-4">
                          {notice.publishedAt
                            ? utcToZonedLocal(
                                new Date(notice.publishedAt),
                                CLUB_DEFAULT_TIMEZONE,
                              ).replace("T", " ")
                            : "—"}
                        </td>
                        <td className="py-3">
                          <Link
                            href={`/manage/notices/${notice.id}`}
                            className="focus-visible:ring-ring/50 rounded underline focus-visible:ring-3"
                          >
                            管理
                          </Link>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
