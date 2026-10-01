import Link from "next/link";

import { StatePanel } from "@/components/domain/state-panel";
import { StatusBadge } from "@/components/domain/status-badge";
import { registrationStatusTone, registrationWindowTone } from "@/components/domain/status-tone";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { requireSession } from "@/lib/auth/session";
import { describeEventLocation } from "@/lib/domain/event-location";
import { registrationWindowState } from "@/lib/domain/registration";
import { EVENT_STATUS_LABELS } from "@/lib/domain/event-lifecycle";
import { utcToZonedLocal } from "@/lib/domain/timezone";
import { listStudentEvents } from "@/lib/student/registrations";
import { heroAction } from "@/lib/domain/student-home";
import {
  REGISTRATION_STATUS_LABELS,
  REGISTRATION_WINDOW_LABELS,
} from "@/lib/validation/registrations";

export const metadata = { title: "活动 · INSPIRA" };

export const dynamic = "force-dynamic";

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
        <div>
          <h1 className="text-h2 font-semibold tracking-tight">活动</h1>
          <p className="text-muted-foreground text-sm">报名、准备，并回顾过去的活动。</p>
        </div>
        <Button asChild variant="outline" size="sm">
          <Link href="/student">返回我的辩论社</Link>
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
            const action = heroAction(event, now);
            return (
              <Card key={event.id}>
                <CardHeader>
                  <CardTitle className="flex flex-wrap items-center gap-2 text-base">
                    {event.title}
                    {/*
                      规范 §8.2：「One status chip and one primary action.」
                      因此这里只放**一个** chip，而且它回答的是学生真正关心的那个问题
                      ——「我现在的处境是什么」：已经报名就显示报名状态，
                      否则显示报名窗口（报名中 / 尚未开放 / 已截止）。
                      原来两个 chip 并排，颜色互相抢注意力，学生反而要自己判断哪个重要。
                    */}
                    {event.myRegistrationStatus ? (
                      <StatusBadge tone={registrationStatusTone(event.myRegistrationStatus)}>
                        {REGISTRATION_STATUS_LABELS[event.myRegistrationStatus]}
                      </StatusBadge>
                    ) : (
                      <StatusBadge tone={registrationWindowTone(windowState)}>
                        {REGISTRATION_WINDOW_LABELS[windowState] ?? windowState}
                      </StatusBadge>
                    )}
                  </CardTitle>
                </CardHeader>
                <CardContent className="text-muted-foreground flex flex-col gap-1 text-sm">
                  <p>
                    活动日期：<span className="text-foreground">{event.eventDate}</span>（
                    {EVENT_STATUS_LABELS[event.status]}）
                  </p>
                  <p>
                    地点：
                    <span className="text-foreground">{describeEventLocation(event).label}</span>
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
                  {/*
                    主操作也按处境变化：还能报名时是实心的「去报名」，
                    否则是描边的「查看详情」。按钮文案与 hero 上用的是**同一条规则**
                    （`heroAction`），不在这里再写一遍判断。
                  */}
                  <Button
                    asChild
                    size="sm"
                    variant={action.kind === "view" ? "outline" : "default"}
                    className="mt-2 self-start"
                  >
                    <Link href={action.href}>
                      {action.kind === "view" ? "查看详情" : action.label}
                    </Link>
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
