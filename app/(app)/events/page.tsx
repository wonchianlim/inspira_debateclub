import Link from "next/link";

import { StatePanel } from "@/components/domain/state-panel";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { listEvents } from "@/lib/admin/events";
import { AREA_ROLES } from "@/lib/auth/roles";
import { requireSession } from "@/lib/auth/session";
import { EVENT_STATUS_LABELS } from "@/lib/domain/event-lifecycle";
import { utcToZonedLocal } from "@/lib/domain/timezone";

export const metadata = { title: "活动 · INSPIRA" };

export const dynamic = "force-dynamic";

/**
 * 活动列表（所有已登录用户可见）。
 *
 * ⚠️ 这里**不是**安全边界：能读到哪些活动由 RLS 决定（`events_select_authenticated`
 * 允许所有已登录用户读取）。下面的过滤只是**呈现**层面的：
 * 草稿是管理员还在准备的活动，给普通用户看会造成困惑。
 */
export default async function EventsPage() {
  const session = await requireSession();
  const isManager = AREA_ROLES.manage.some((role) => session.roles.includes(role));

  const allEvents = await listEvents();
  const visibleEvents = isManager
    ? allEvents
    : allEvents.filter((event) => event.status !== "draft");

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-semibold tracking-tight">活动</h1>
        {isManager ? (
          <Button asChild variant="outline" size="sm">
            <Link href="/manage/events">进入活动管理</Link>
          </Button>
        ) : null}
      </div>

      {isManager ? (
        <p className="text-muted-foreground text-xs">
          你是管理员，因此这里也会显示草稿活动（参与者看不到草稿）。
        </p>
      ) : null}

      {visibleEvents.length === 0 ? (
        <StatePanel
          variant="empty"
          title="目前没有可报名的活动"
          description="活动发布后会出现在这里。请留意俱乐部发布的通知。"
        />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {visibleEvents.map((event) => (
            <Card key={event.id}>
              <CardHeader>
                <CardTitle className="flex flex-wrap items-center gap-2 text-base">
                  {event.title}
                  <Badge variant={event.status === "draft" ? "outline" : "secondary"}>
                    {EVENT_STATUS_LABELS[event.status] ?? event.status}
                  </Badge>
                </CardTitle>
              </CardHeader>
              <CardContent className="text-muted-foreground flex flex-col gap-1 text-sm">
                <p>
                  开始时间（{event.timezone}）：
                  <span className="text-foreground">
                    {utcToZonedLocal(new Date(event.startsAt), event.timezone).replace("T", " ")}
                  </span>
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
                <p>启用赛制：{event.enabledFormatCount} 个</p>
                <p className="text-xs">
                  报名功能将在 Phase 3 开放。届时这里会出现「我要报名」按钮。
                </p>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
