import Link from "next/link";
import { notFound } from "next/navigation";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getEventDetail } from "@/lib/admin/events";
import { listAllFormats } from "@/lib/admin/formats";
import { AREA_ROLES } from "@/lib/auth/roles";
import { requireAnyRole } from "@/lib/auth/session";
import { EVENT_HAPPY_PATH, EVENT_STATUS_LABELS } from "@/lib/domain/event-lifecycle";
import { utcToZonedLocal } from "@/lib/domain/timezone";

import { CloneEventForm } from "./clone-form";
import { EventFormatsForm } from "./event-formats-form";
import { StatusTransitionForm } from "./status-transition-form";
import { EventForm } from "../event-form";

export const metadata = { title: "活动详情 · INSPIRA" };

export const dynamic = "force-dynamic";

/** 界面上统一按活动时区显示时间，避免"服务器在上海、活动在别处"造成误解。 */
function formatZoned(iso: string, timezone: string): string {
  return utcToZonedLocal(new Date(iso), timezone).replace("T", " ");
}

export default async function EventDetailPage({
  params,
}: {
  params: Promise<{ eventId: string }>;
}) {
  await requireAnyRole(AREA_ROLES.manage);
  const { eventId } = await params;

  const [event, formats] = await Promise.all([getEventDetail(eventId), listAllFormats()]);
  if (!event) notFound();

  const enabledFormatIds = event.formats
    .filter((format) => format.enabled)
    .map((format) => format.formatId);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-semibold tracking-tight">{event.title}</h1>
        <Button asChild variant="outline" size="sm">
          <Link href="/manage/events">返回活动列表</Link>
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">当前安排</CardTitle>
        </CardHeader>
        <CardContent>
          <dl className="grid gap-3 text-sm sm:grid-cols-2">
            <div className="flex flex-col gap-0.5">
              <dt className="text-muted-foreground text-xs">状态</dt>
              <dd>
                <Badge variant={event.status === "draft" ? "outline" : "secondary"}>
                  {EVENT_STATUS_LABELS[event.status] ?? event.status}
                </Badge>
              </dd>
            </div>
            <div className="flex flex-col gap-0.5">
              <dt className="text-muted-foreground text-xs">活动日期 / 时区</dt>
              <dd>
                {event.eventDate} · {event.timezone}
              </dd>
            </div>
            <div className="flex flex-col gap-0.5">
              <dt className="text-muted-foreground text-xs">报名开放</dt>
              <dd>{formatZoned(event.registrationOpensAt, event.timezone)}</dd>
            </div>
            <div className="flex flex-col gap-0.5">
              <dt className="text-muted-foreground text-xs">报名截止</dt>
              <dd>{formatZoned(event.registrationClosesAt, event.timezone)}</dd>
            </div>
            <div className="flex flex-col gap-0.5">
              <dt className="text-muted-foreground text-xs">签到开放</dt>
              <dd>{formatZoned(event.checkInOpensAt, event.timezone)}</dd>
            </div>
            <div className="flex flex-col gap-0.5">
              <dt className="text-muted-foreground text-xs">警示时间</dt>
              <dd>{formatZoned(event.warningAt, event.timezone)}</dd>
            </div>
            <div className="flex flex-col gap-0.5">
              <dt className="text-muted-foreground text-xs">活动开始</dt>
              <dd>{formatZoned(event.startsAt, event.timezone)}</dd>
            </div>
            <div className="flex flex-col gap-0.5">
              <dt className="text-muted-foreground text-xs">活动结束</dt>
              <dd>{formatZoned(event.endsAt, event.timezone)}</dd>
            </div>
            {event.meetingUrl ? (
              <div className="flex flex-col gap-0.5 sm:col-span-2">
                <dt className="text-muted-foreground text-xs">会议链接</dt>
                <dd className="break-all">{event.meetingUrl}</dd>
              </div>
            ) : null}
            {event.notice ? (
              <div className="flex flex-col gap-0.5 sm:col-span-2">
                <dt className="text-muted-foreground text-xs">活动说明</dt>
                <dd className="whitespace-pre-wrap">{event.notice}</dd>
              </div>
            ) : null}
          </dl>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">状态流程</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <p className="text-muted-foreground text-sm">
            完整流程：{EVENT_HAPPY_PATH.map((status) => EVENT_STATUS_LABELS[status]).join(" → ")}
          </p>

          {/*
            报名即将开放、但一个赛制都没启用时给出明确警告。
            这种情况不是"非法"（规范没有禁止），但学生报名时会没有赛制可选，
            属于几乎必然的配置遗漏，因此在最显眼的位置提示。
          */}
          {event.enabledFormatCount === 0 ? (
            <p
              role="alert"
              className="border-destructive/40 text-destructive rounded-md border px-3 py-2 text-sm"
            >
              本活动还没有启用任何赛制。开启报名前请先在下方「活动赛制」里勾选至少一个，
              否则学生报名时没有赛制可选。
            </p>
          ) : null}

          <StatusTransitionForm eventId={event.id} currentStatus={event.status} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">活动赛制</CardTitle>
        </CardHeader>
        <CardContent>
          <EventFormatsForm
            eventId={event.id}
            formats={formats}
            enabledFormatIds={enabledFormatIds}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">修改活动信息</CardTitle>
        </CardHeader>
        <CardContent>
          <EventForm
            mode="edit"
            eventId={event.id}
            defaults={{
              title: event.title,
              timezone: event.timezone,
              startsAtLocal: utcToZonedLocal(new Date(event.startsAt), event.timezone),
              endsAtLocal: utcToZonedLocal(new Date(event.endsAt), event.timezone),
              registrationOpensAtLocal: utcToZonedLocal(
                new Date(event.registrationOpensAt),
                event.timezone,
              ),
              registrationClosesAtLocal: utcToZonedLocal(
                new Date(event.registrationClosesAt),
                event.timezone,
              ),
              checkInOpensAtLocal: utcToZonedLocal(new Date(event.checkInOpensAt), event.timezone),
              warningAtLocal: utcToZonedLocal(new Date(event.warningAt), event.timezone),
              meetingUrl: event.meetingUrl ?? "",
              notice: event.notice ?? "",
            }}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">克隆活动</CardTitle>
        </CardHeader>
        <CardContent>
          <CloneEventForm
            eventId={event.id}
            suggestedTitle={`${event.title}（副本）`}
            suggestedStartsAtLocal={utcToZonedLocal(
              new Date(new Date(event.startsAt).getTime() + 7 * 24 * 60 * 60 * 1000),
              event.timezone,
            )}
          />
        </CardContent>
      </Card>
    </div>
  );
}
