import Link from "next/link";
import { notFound } from "next/navigation";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { requireSession } from "@/lib/auth/session";
import { describeEventLocation } from "@/lib/domain/event-location";
import { isCheckInOpen, registrationWindowState } from "@/lib/domain/registration";
import { utcToZonedLocal } from "@/lib/domain/timezone";
import { getStudentEventDetail } from "@/lib/student/registrations";

import { getMyPartnerCode, listPartnerRequestsForEvent } from "@/lib/student/partners";

import { PartnerSection } from "./partner-section";
import { PreferencesForm } from "./preferences-form";
import { RegistrationForm } from "./registration-form";

export const metadata = { title: "活动详情 · INSPIRA" };

export const dynamic = "force-dynamic";

export default async function StudentEventDetailPage({
  params,
}: {
  params: Promise<{ eventId: string }>;
}) {
  await requireSession();
  const { eventId } = await params;

  const event = await getStudentEventDetail(eventId);
  if (!event) notFound();

  const [myPartnerCode, partnerRequests] = await Promise.all([
    getMyPartnerCode(),
    listPartnerRequestsForEvent(eventId),
  ]);

  const windowState = registrationWindowState({
    eventStatus: event.status,
    registrationOpensAt: new Date(event.registrationOpensAt),
    registrationClosesAt: new Date(event.registrationClosesAt),
    now: new Date(),
  });

  const WINDOW_MESSAGES: Record<string, string> = {
    event_not_available: "这个活动当前不接受报名。",
    not_open_yet: `报名将于 ${utcToZonedLocal(new Date(event.registrationOpensAt), event.timezone).replace("T", " ")} 开放。`,
    closed: "报名已经截止。如果在截止前取消过，仍然可以联系管理员。",
    open: "",
  };

  const isRegistered =
    event.myRegistrationStatus === "registered" || event.myRegistrationStatus === "checked_in";

  /*
   * 签到窗口。权威值是**这次活动自己的** `check_in_opens_at`
   * （不是"开始前 30 分钟"那个默认值 —— 管理员可以在系统设置里改掉它）。
   * 服务端与数据库用同一条规则，界面这里只是不显示一个必然失败的按钮。
   */
  const now = new Date();
  const checkInOpensAt = new Date(event.checkInOpensAt);
  const checkInOpen = isCheckInOpen(checkInOpensAt, now);
  const checkInOpensAtLabel = utcToZonedLocal(checkInOpensAt, event.timezone).replace("T", " ");

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-semibold tracking-tight">{event.title}</h1>
        <Button asChild variant="outline" size="sm">
          <Link href="/student/events">返回活动列表</Link>
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">活动信息</CardTitle>
        </CardHeader>
        <CardContent>
          <dl className="grid gap-3 text-sm sm:grid-cols-2">
            <div className="flex flex-col gap-0.5">
              <dt className="text-muted-foreground text-xs">活动日期 / 时区</dt>
              <dd>
                {event.eventDate} · {event.timezone}
              </dd>
            </div>
            <div className="flex flex-col gap-0.5">
              <dt className="text-muted-foreground text-xs">活动时间</dt>
              <dd>
                {utcToZonedLocal(new Date(event.startsAt), event.timezone).replace("T", " ")} 至{" "}
                {utcToZonedLocal(new Date(event.endsAt), event.timezone).replace("T", " ")}
              </dd>
            </div>
            <div className="flex flex-col gap-0.5">
              <dt className="text-muted-foreground text-xs">地点</dt>
              <dd>{describeEventLocation(event).label}</dd>
            </div>
            <div className="flex flex-col gap-0.5">
              <dt className="text-muted-foreground text-xs">报名窗口</dt>
              <dd>
                {utcToZonedLocal(new Date(event.registrationOpensAt), event.timezone).replace(
                  "T",
                  " ",
                )}{" "}
                至{" "}
                {utcToZonedLocal(new Date(event.registrationClosesAt), event.timezone).replace(
                  "T",
                  " ",
                )}
              </dd>
            </div>
            <div className="flex flex-col gap-0.5">
              <dt className="text-muted-foreground text-xs">签到开放</dt>
              <dd>
                {utcToZonedLocal(new Date(event.checkInOpensAt), event.timezone).replace("T", " ")}
              </dd>
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
          <CardTitle className="text-base">报名</CardTitle>
        </CardHeader>
        <CardContent>
          <RegistrationForm
            eventId={event.id}
            registrationId={event.myRegistrationId}
            status={event.myRegistrationStatus}
            windowOpen={windowState === "open"}
            windowMessage={WINDOW_MESSAGES[windowState] ?? ""}
            checkInOpen={checkInOpen}
            checkInOpensAtLabel={checkInOpensAtLabel}
          />
        </CardContent>
      </Card>

      {isRegistered && event.myRegistrationId ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">赛制偏好</CardTitle>
          </CardHeader>
          <CardContent>
            <PreferencesForm registrationId={event.myRegistrationId} formats={event.formats} />
          </CardContent>
        </Card>
      ) : (
        <p className="text-muted-foreground text-sm">报名之后可以在这里选择想参加的赛制并排序。</p>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">搭档</CardTitle>
        </CardHeader>
        <CardContent>
          <PartnerSection
            eventId={event.id}
            myPartnerCode={myPartnerCode}
            requests={partnerRequests}
            canInvite={isRegistered}
            cannotInviteReason="报名之后才能邀请搭档。"
          />
        </CardContent>
      </Card>
    </div>
  );
}
