import Link from "next/link";
import { notFound } from "next/navigation";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getNoticeDetail } from "@/lib/admin/notices";
import { listEvents } from "@/lib/admin/events";
import { listAllFormats } from "@/lib/admin/formats";
import { AREA_ROLES } from "@/lib/auth/roles";
import { requireAnyRole } from "@/lib/auth/session";
import { CLUB_DEFAULT_TIMEZONE, utcToZonedLocal } from "@/lib/domain/timezone";
import type { NoticeFormDefaults } from "../notice-form";
import { NoticeForm } from "../notice-form";

import { DeleteNoticeForm } from "./delete-notice-form";

export const metadata = { title: "通知详情 · INSPIRA" };

export const dynamic = "force-dynamic";

export default async function NoticeDetailPage({
  params,
}: {
  params: Promise<{ noticeId: string }>;
}) {
  await requireAnyRole(AREA_ROLES.manage);
  const { noticeId } = await params;

  const [notice, events, formats] = await Promise.all([
    getNoticeDetail(noticeId),
    listEvents(),
    listAllFormats(),
  ]);
  if (!notice) notFound();

  // 编辑表单用"本地时间"回填：已发布的通知仍然是已发布，因此发布方式默认是"立即发布"
  const defaults: NoticeFormDefaults = {
    title: notice.title,
    body: notice.body,
    audienceType: notice.audienceType,
    eventId: notice.eventId ?? "",
    role: notice.role ?? "",
    formatId: notice.formatId ?? "",
    publishMode: notice.publishedAt ? "now" : "draft",
    publishedAtLocal: notice.publishedAt
      ? utcToZonedLocal(new Date(notice.publishedAt), CLUB_DEFAULT_TIMEZONE)
      : "",
    expiresAtLocal: notice.expiresAt
      ? utcToZonedLocal(new Date(notice.expiresAt), CLUB_DEFAULT_TIMEZONE)
      : "",
    timezone: CLUB_DEFAULT_TIMEZONE,
  };

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-semibold tracking-tight">{notice.title}</h1>
        <Button asChild variant="outline" size="sm">
          <Link href="/manage/notices">返回通知列表</Link>
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">修改通知</CardTitle>
        </CardHeader>
        <CardContent>
          <NoticeForm
            mode="edit"
            noticeId={notice.id}
            defaults={defaults}
            eventOptions={events.map((event) => ({ id: event.id, title: event.title }))}
            formatOptions={formats.map((format) => ({
              id: format.id,
              code: format.code,
              name: format.name,
            }))}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">删除</CardTitle>
        </CardHeader>
        <CardContent>
          <DeleteNoticeForm noticeId={notice.id} />
        </CardContent>
      </Card>
    </div>
  );
}
