import { notFound } from "next/navigation";

import { MetaChip } from "@/components/domain/meta-chip";
import {
  BackToEventsLink,
  EventDetailHero,
  MY_REGISTRATION_ANCHOR,
} from "@/components/domain/event-detail-hero";
import { StatusBadge } from "@/components/domain/status-badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { requireSession } from "@/lib/auth/session";
import { isCheckInOpen, registrationWindowState } from "@/lib/domain/registration";
import { utcToZonedLocal } from "@/lib/domain/timezone";
import { LATE_CANCELLATION_WARNING } from "@/lib/validation/registrations";
import { getMyPartnerCode, listPartnerRequestsForEvent } from "@/lib/student/partners";
import { getStudentEventDetail } from "@/lib/student/registrations";

import { PartnerSection } from "./partner-section";
import { PreferencesForm } from "./preferences-form";
import { RegistrationForm } from "./registration-form";

export const metadata = { title: "活动详情 · INSPIRA" };

export const dynamic = "force-dynamic";

/**
 * 学生活动详情（UI/UX 规范 §8.3）。
 *
 * 结构按规范列的那几节，顺序也一样：
 *   hero 摘要 → 关于这场活动 → 时间安排 → 资格与赛制 → 我的报名 → 重要信息。
 *
 * ⚠️ 规范还列了 "Published `Rounds and results` only after availability"。
 * 这一节**没有做**，因为学生端根本没有轮次与结果的页面或数据
 * （`/rounds`、`/results` 在系统里不存在）。搭它们是新功能，不是 UI 改造。
 *
 * ⚠️ 规范 §8.4 要求区分 "Save draft" 与 "Submit registration"。
 * 这也没有做：报名表里没有"草稿"这个状态（数据库的报名状态只有
 * registered / cancelled / late_cancelled / checked_in / no_show）。
 * 加草稿态是数据模型改动，属于产品决定，我没有自己加。
 */
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

  const now = new Date();
  const localDateTime = (iso: string) =>
    utcToZonedLocal(new Date(iso), event.timezone).replace("T", " ");

  const windowState = registrationWindowState({
    eventStatus: event.status,
    registrationOpensAt: new Date(event.registrationOpensAt),
    registrationClosesAt: new Date(event.registrationClosesAt),
    now,
  });

  const WINDOW_MESSAGES: Record<string, string> = {
    event_not_available: "这个活动当前不接受报名。",
    not_open_yet: `报名将于 ${localDateTime(event.registrationOpensAt)} 开放。`,
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
  const checkInOpensAt = new Date(event.checkInOpensAt);
  const checkInOpen = isCheckInOpen(checkInOpensAt, now);
  const checkInOpensAtLabel = localDateTime(event.checkInOpensAt);

  const enabledFormats = event.formats.filter((format) => format.eventFormatEnabled);

  return (
    <div className="flex flex-col gap-8">
      <div>
        <BackToEventsLink />
      </div>

      <EventDetailHero event={event} now={now} />

      {/* ---------------- 关于这场活动 ---------------- */}
      <section aria-labelledby="about-heading" className="flex flex-col gap-2">
        <h2 id="about-heading" className="text-title font-semibold">
          关于这场活动
        </h2>
        {event.notice ? (
          // 保留换行：管理员写的分段是有意的，压成一行会读不出重点
          <p className="max-w-prose text-sm whitespace-pre-wrap">{event.notice}</p>
        ) : (
          <p className="text-muted-foreground text-sm">管理员还没有填写活动说明。</p>
        )}
      </section>

      {/* ---------------- 时间安排 ---------------- */}
      <section aria-labelledby="schedule-heading" className="flex flex-col gap-2">
        <h2 id="schedule-heading" className="text-title font-semibold">
          时间安排
        </h2>
        <Card>
          <CardContent className="pt-6">
            {/*
              ⚠️ 所有时间都按**活动自己的时区**显示，并且每一行都把时区写出来。
              规范第 17 节："Compute late cancellation, warning, and overdue behavior
              from timestamps, not browser-local assumptions."
            */}
            <dl className="grid gap-3 text-sm sm:grid-cols-2">
              <div className="flex flex-col gap-0.5">
                <dt className="text-muted-foreground text-xs">活动日期（{event.timezone}）</dt>
                <dd>{event.eventDate}</dd>
              </div>
              <div className="flex flex-col gap-0.5">
                <dt className="text-muted-foreground text-xs">活动时间</dt>
                <dd>
                  {localDateTime(event.startsAt)} 至 {localDateTime(event.endsAt)}
                </dd>
              </div>
              <div className="flex flex-col gap-0.5">
                <dt className="text-muted-foreground text-xs">报名开放</dt>
                <dd>{localDateTime(event.registrationOpensAt)}</dd>
              </div>
              <div className="flex flex-col gap-0.5">
                <dt className="text-muted-foreground text-xs">报名截止</dt>
                <dd>{localDateTime(event.registrationClosesAt)}</dd>
              </div>
              <div className="flex flex-col gap-0.5">
                <dt className="text-muted-foreground text-xs">签到开放</dt>
                <dd>{checkInOpensAtLabel}</dd>
              </div>
            </dl>
          </CardContent>
        </Card>
      </section>

      {/* ---------------- 资格与赛制 ---------------- */}
      <section aria-labelledby="formats-heading" className="flex flex-col gap-2">
        <h2 id="formats-heading" className="text-title font-semibold">
          资格与赛制
        </h2>
        <Card>
          <CardContent className="flex flex-col gap-4 pt-6 text-sm">
            {enabledFormats.length === 0 ? (
              <p className="text-muted-foreground">这个活动还没有启用任何赛制。</p>
            ) : (
              <ul className="flex flex-col gap-2">
                {enabledFormats.map((format) => (
                  <li key={format.formatId} className="flex flex-wrap items-center gap-2">
                    <MetaChip>{format.code}</MetaChip>
                    <span>{format.name}</span>
                    {/*
                      资格只影响"我能不能被排进这个赛制"，报名本身仍然可以完成 ——
                      因此写成一句说明，而不是把整个赛制藏起来。
                    */}
                    {format.studentEligible ? (
                      <StatusBadge tone="success">你已具备资格</StatusBadge>
                    ) : (
                      <StatusBadge tone="warning">你暂无资格</StatusBadge>
                    )}
                    {format.myPreferenceRank !== null ? (
                      <span className="text-muted-foreground text-xs">
                        你的偏好：第 {format.myPreferenceRank} 位
                      </span>
                    ) : null}
                  </li>
                ))}
              </ul>
            )}

            {isRegistered && event.myRegistrationId ? (
              <div className="border-border border-t pt-4">
                <p className="mb-2 font-medium">想参加的赛制与排序</p>
                <PreferencesForm registrationId={event.myRegistrationId} formats={event.formats} />
              </div>
            ) : (
              <p className="text-muted-foreground border-border border-t pt-4">
                报名之后可以在这里选择想参加的赛制并排序。
              </p>
            )}
          </CardContent>
        </Card>
      </section>

      {/* ---------------- 我的报名 ---------------- */}
      <section id={MY_REGISTRATION_ANCHOR} aria-labelledby="my-registration-heading">
        <h2 id="my-registration-heading" className="text-title font-semibold">
          我的报名
        </h2>
        <Card className="mt-2">
          <CardContent className="pt-6">
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

        <Card className="mt-4">
          <CardHeader>
            <CardTitle className="text-base">搭档</CardTitle>
          </CardHeader>
          <CardContent>
            {/*
              规范第 10 节的搭档规则：这是**强烈偏好，不是保证** ——
              这句话由 PartnerSection 自己给出（PARTNER_IS_PREFERENCE_NOT_GUARANTEE），
              因此这里不重复写一遍。
            */}
            <PartnerSection
              eventId={event.id}
              myPartnerCode={myPartnerCode}
              requests={partnerRequests}
              canInvite={isRegistered}
              cannotInviteReason="报名之后才能邀请搭档。"
            />
          </CardContent>
        </Card>
      </section>

      {/* ---------------- 重要信息 ---------------- */}
      <section aria-labelledby="important-heading" className="flex flex-col gap-2">
        <h2 id="important-heading" className="text-title font-semibold">
          重要信息
        </h2>
        <Card>
          <CardContent className="flex flex-col gap-3 pt-6 text-sm">
            {/* 迟到取消的后果必须**在取消之前**看到，而不是取消之后才发现 */}
            <p className="text-muted-foreground">{LATE_CANCELLATION_WARNING}</p>

            {/*
              ⚠️ 这里**不讲签到开放时刻** —— 上面「我的报名」那一节已经讲了，
              而且那里讲得更准（它会随窗口开没开而变化）。
              同一句话写两遍，改的时候就会只改一处。
            */}
            <p className="text-muted-foreground">
              签到要在签到窗口开放后自己完成；如果你已经到现场但签到失败，请让管理员代为签到。
            </p>

            {event.meetingUrl ? (
              <p className="text-muted-foreground">
                线上会议链接：
                <a
                  href={event.meetingUrl}
                  className="focus-visible:ring-ring/50 text-foreground break-all underline underline-offset-4 focus-visible:ring-3 focus-visible:outline-none"
                >
                  {event.meetingUrl}
                </a>
              </p>
            ) : (
              <p className="text-muted-foreground">这是线下活动，没有线上会议链接。</p>
            )}
          </CardContent>
        </Card>
      </section>
    </div>
  );
}
