import Link from "next/link";

import { StatePanel } from "@/components/domain/state-panel";
import { StatusBadge } from "@/components/domain/status-badge";
import { registrationStatusTone, registrationWindowTone } from "@/components/domain/status-tone";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { requireSession } from "@/lib/auth/session";
import { registrationWindowState } from "@/lib/domain/registration";
import { EVENT_STATUS_LABELS } from "@/lib/domain/event-lifecycle";
import { utcToZonedLocal } from "@/lib/domain/timezone";
import { listStudentEvents } from "@/lib/student/registrations";
import { REGISTRATION_STATUS_LABELS } from "@/lib/validation/registrations";

export const metadata = { title: "活动报名 · INSPIRA" };

export const dynamic = "force-dynamic";

const WINDOW_LABELS: Record<string, string> = {
  event_not_available: "不可报名",
  not_open_yet: "尚未开放",
  open: "报名中",
  closed: "已截止",
};

export default async function StudentEventsPage() {
  await requireSession();
  const events = await listStudentEvents();
  const now = new Date();

  // 草稿是管理员还在准备的活动，学生不应看到。
  // ⚠️ 这只是**呈现**层面的过滤；真正的边界是数据库策略。
  const visible = events.filter(
    (event) =>
      event.status !== "draft" && event.status !== "cancelled" && event.status !== "archived",
  );

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-semibold tracking-tight">活动报名</h1>
        <Button asChild variant="outline" size="sm">
          <Link href="/student">返回学生区域</Link>
        </Button>
      </div>

      {visible.length === 0 ? (
        <StatePanel
          variant="empty"
          title="目前没有可报名的活动"
          description="活动开放报名后会出现在这里，同时你也会收到通知。"
        />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {visible.map((event) => {
            const windowState = registrationWindowState({
              eventStatus: event.status,
              registrationOpensAt: new Date(event.registrationOpensAt),
              registrationClosesAt: new Date(event.registrationClosesAt),
              now,
            });
            return (
              <Card key={event.id}>
                <CardHeader>
                  <CardTitle className="flex flex-wrap items-center gap-2 text-base">
                    {event.title}
                    <StatusBadge tone={registrationWindowTone(windowState)}>
                      {WINDOW_LABELS[windowState] ?? windowState}
                    </StatusBadge>
                    {event.myRegistrationStatus ? (
                      <StatusBadge tone={registrationStatusTone(event.myRegistrationStatus)}>
                        {REGISTRATION_STATUS_LABELS[event.myRegistrationStatus]}
                      </StatusBadge>
                    ) : null}
                  </CardTitle>
                </CardHeader>
                <CardContent className="text-muted-foreground flex flex-col gap-1 text-sm">
                  <p>
                    活动日期：<span className="text-foreground">{event.eventDate}</span>（
                    {EVENT_STATUS_LABELS[event.status]}）
                  </p>
                  <p>
                    开始时间（{event.timezone}）：
                    {utcToZonedLocal(new Date(event.startsAt), event.timezone).replace("T", " ")}
                  </p>
                  <p>
                    报名窗口：
                    {utcToZonedLocal(new Date(event.registrationOpensAt), event.timezone).replace(
                      "T",
                      " ",
                    )}
                    {" 至 "}
                    {utcToZonedLocal(new Date(event.registrationClosesAt), event.timezone).replace(
                      "T",
                      " ",
                    )}
                  </p>
                  <Button asChild size="sm" variant="outline" className="mt-2 self-start">
                    <Link href={`/student/events/${event.id}`}>查看详情</Link>
                  </Button>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
