import Link from "next/link";

import { MetaChip } from "@/components/domain/meta-chip";
import { NextDebateHero } from "@/components/domain/next-debate-hero";
import { StatePanel } from "@/components/domain/state-panel";
import { StatusBadge } from "@/components/domain/status-badge";
import { registrationStatusTone, registrationWindowTone } from "@/components/domain/status-tone";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { requireSession } from "@/lib/auth/session";
import { studentGreeting } from "@/lib/domain/greeting";
import { registrationWindowState } from "@/lib/domain/registration";
import {
  isNewStudent,
  primaryFormatCode,
  selectHomeMetrics,
  selectNextEvent,
  selectUpcomingEvents,
} from "@/lib/domain/student-home";
import { summarizeStudentHistory } from "@/lib/domain/student-history";
import { CLUB_DEFAULT_TIMEZONE, utcToZonedLocal } from "@/lib/domain/timezone";
import { listVisibleNotices } from "@/lib/admin/notices";
import { listMyPublishedBallots, toHistoryEntries } from "@/lib/student/ballots";
import { listStudentEvents } from "@/lib/student/registrations";
import {
  REGISTRATION_STATUS_LABELS,
  REGISTRATION_WINDOW_LABELS,
} from "@/lib/validation/registrations";

export const metadata = { title: "我的辩论社 · INSPIRA" };

export const dynamic = "force-dynamic";

const RECENT_FEEDBACK_LIMIT = 3;
const UPCOMING_EVENT_LIMIT = 3;
const RECENT_ACTIVITY_LIMIT = 5;

/** 把 ISO 时刻按某个时区显示成 `2026-10-15 18:00`。 */
function localDateTime(iso: string, timeZone: string): string {
  return utcToZonedLocal(new Date(iso), timeZone).replace("T", " ");
}

/**
 * 学生首页（UI/UX 规范 §8.1「Student Home」）。
 *
 * ⚠️ 这个页面**替换掉的是一张会说假话的页面**。
 *
 * 它原来叫「学生区域」，是一张手写的功能清单，上面写着
 * 签到「待建设 · Phase 6」、我的评分表「待建设 · Phase 7」、
 * 我的历史「待建设 · Phase 8」—— 而这三个功能**当时全部已经做完并且在线上可用**。
 * 学生看到的是"这些还没做"，而它们就在导航里。
 *
 * 原因不复杂：那是一张手写的清单，写在更早的阶段，之后没有人回头改，
 * 也没有任何测试会去看它的内容。教训与页脚曾经那句「当前为 Phase 1」完全一样：
 * **不要在常驻界面里手写"当前进度"**。现在这一页显示的全部是**查出来的数据**，
 * 没有会过期的进度文字。
 *
 * 结构按规范 §8.1：问候 → 下一场 hero → 最多三张指标 → 最近反馈 →
 * 即将到来的活动 → 最近动态；什么都没有时给一段引导，而不是一个巨大的空白框。
 */
export default async function StudentHomePage() {
  const session = await requireSession();
  const now = new Date();

  const [events, ballots, notices] = await Promise.all([
    listStudentEvents(),
    listMyPublishedBallots(),
    listVisibleNotices(),
  ]);

  const history = summarizeStudentHistory(toHistoryEntries(ballots));
  const upcoming = selectUpcomingEvents(events, now, UPCOMING_EVENT_LIMIT);
  const nextEvent = selectNextEvent(events, now);
  const formatMetric = primaryFormatCode(history.byFormat);
  const metrics = selectHomeMetrics({
    totalDebates: history.totalDebates,
    primaryFormatCode: formatMetric,
    feedbackCount: ballots.length,
  });
  const recentFeedback = ballots.slice(0, RECENT_FEEDBACK_LIMIT);
  const recentActivity = notices.slice(0, RECENT_ACTIVITY_LIMIT);
  const newStudent = isNewStudent({
    upcomingEventCount: upcoming.length,
    totalDebates: history.totalDebates,
    feedbackCount: ballots.length,
  });

  return (
    <div className="flex flex-col gap-8">
      <div>
        <h1 className="text-h2 font-semibold tracking-tight">
          {studentGreeting(now, session.displayName)}
        </h1>
        <p className="text-muted-foreground text-sm">这是辩论社最近的情况。</p>
      </div>

      {/* ---------------- 下一场 / 新学生引导 ---------------- */}
      {newStudent ? (
        <Card>
          <CardContent className="flex flex-col items-start gap-3 py-8">
            <h2 className="text-title font-semibold">你的辩论之旅从这里开始</h2>
            <p className="text-muted-foreground max-w-prose text-sm">
              浏览即将开始的活动，报名参加你的第一场。
            </p>
            <Button asChild>
              <Link href="/student/events">浏览活动</Link>
            </Button>
          </CardContent>
        </Card>
      ) : nextEvent ? (
        <NextDebateHero event={nextEvent} now={now} />
      ) : (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">暂时没有即将开始的活动</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col items-start gap-3">
            <p className="text-muted-foreground text-sm">
              活动发布后会出现在这里；发布时你也会收到通知。
            </p>
            <Button asChild variant="outline" size="sm">
              <Link href="/student/events">浏览活动</Link>
            </Button>
          </CardContent>
        </Card>
      )}

      {/* ---------------- 指标（最多三张，没意义就不显示） ---------------- */}
      {metrics.length > 0 ? (
        <div className="grid gap-4 sm:grid-cols-3">
          <Card>
            <CardHeader>
              <CardTitle className="text-muted-foreground text-xs font-medium">
                已完成的辩论场次
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-h2 font-semibold">{history.totalDebates}</p>
            </CardContent>
          </Card>

          {metrics.includes("primaryFormat") && formatMetric ? (
            <Card>
              <CardHeader>
                <CardTitle className="text-muted-foreground text-xs font-medium">
                  主要赛制
                </CardTitle>
              </CardHeader>
              <CardContent>
                <MetaChip>{formatMetric}</MetaChip>
              </CardContent>
            </Card>
          ) : null}

          {metrics.includes("feedback") ? (
            <Card>
              <CardHeader>
                <CardTitle className="text-muted-foreground text-xs font-medium">
                  可看的反馈
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-h2 font-semibold">{ballots.length}</p>
              </CardContent>
            </Card>
          ) : null}
        </div>
      ) : null}

      {/* ---------------- 最近反馈 ---------------- */}
      <section aria-labelledby="recent-feedback-heading" className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 id="recent-feedback-heading" className="text-title font-semibold">
            最近反馈
          </h2>
          {ballots.length > 0 ? (
            <Link
              href="/student/ballots"
              className="focus-visible:ring-ring/50 rounded text-sm underline underline-offset-4 focus-visible:ring-3 focus-visible:outline-none"
            >
              查看全部评分表
            </Link>
          ) : null}
        </div>

        {recentFeedback.length === 0 ? (
          <p className="text-muted-foreground text-sm">
            裁判提交、管理员发布之后，你就能在这里看到自己的分数与反馈。
          </p>
        ) : (
          <ul className="flex flex-col gap-3">
            {recentFeedback.map((ballot) => (
              <li key={ballot.ballotId}>
                <Card>
                  <CardContent className="flex flex-wrap items-center justify-between gap-3 py-4">
                    <div className="flex flex-col gap-0.5">
                      <span className="font-medium">
                        第 {ballot.matchNumber} 场 · {ballot.roomName}
                      </span>
                      <span className="text-muted-foreground text-xs">
                        {localDateTime(ballot.scheduledStart, CLUB_DEFAULT_TIMEZONE)}
                        {ballot.templateName ? ` · ${ballot.templateName}` : ""}
                      </span>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <MetaChip>{ballot.formatCode}</MetaChip>
                      {/*
                        BP 用名次而不是胜负，因此没有胜方时要显示名次，
                        否则 BP 的学生会看到一片空白，以为系统坏了。
                      */}
                      {ballot.myRank !== null ? (
                        <StatusBadge>第 {ballot.myRank} 名</StatusBadge>
                      ) : ballot.outcome ? (
                        <StatusBadge tone={ballot.outcome === "win" ? "success" : "neutral"}>
                          {ballot.outcome === "win" ? "胜" : "负"}
                        </StatusBadge>
                      ) : null}
                      <Button asChild variant="outline" size="sm">
                        <Link href="/student/ballots">读评分表</Link>
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* ---------------- 即将到来的活动 ---------------- */}
      <section aria-labelledby="upcoming-events-heading" className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 id="upcoming-events-heading" className="text-title font-semibold">
            即将到来的活动
          </h2>
          <Link
            href="/student/events"
            className="focus-visible:ring-ring/50 rounded text-sm underline underline-offset-4 focus-visible:ring-3 focus-visible:outline-none"
          >
            全部活动
          </Link>
        </div>

        {upcoming.length === 0 ? (
          <StatePanel
            variant="empty"
            title="目前没有即将开始的活动"
            description="活动发布后会出现在这里，同时你也会收到通知。"
          />
        ) : (
          <ul className="flex flex-col gap-2">
            {upcoming.map((event) => {
              const windowState = registrationWindowState({
                eventStatus: event.status,
                registrationOpensAt: new Date(event.registrationOpensAt),
                registrationClosesAt: new Date(event.registrationClosesAt),
                now,
              });
              return (
                <li
                  key={event.id}
                  className="border-border flex flex-wrap items-center justify-between gap-3 rounded-md border px-3 py-3"
                >
                  <div className="flex flex-col gap-0.5">
                    <span className="font-medium">{event.title}</span>
                    <span className="text-muted-foreground text-xs">
                      {localDateTime(event.startsAt, event.timezone)}
                    </span>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <StatusBadge tone={registrationWindowTone(windowState)}>
                      {REGISTRATION_WINDOW_LABELS[windowState] ?? windowState}
                    </StatusBadge>
                    {event.myRegistrationStatus ? (
                      <StatusBadge tone={registrationStatusTone(event.myRegistrationStatus)}>
                        {REGISTRATION_STATUS_LABELS[event.myRegistrationStatus]}
                      </StatusBadge>
                    ) : null}
                    <Link
                      href={`/student/events/${event.id}`}
                      className="focus-visible:ring-ring/50 rounded text-sm underline underline-offset-4 focus-visible:ring-3 focus-visible:outline-none"
                    >
                      查看
                    </Link>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {/* ---------------- 最近动态 ---------------- */}
      <section aria-labelledby="recent-activity-heading" className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 id="recent-activity-heading" className="text-title font-semibold">
            最近动态
          </h2>
          {recentActivity.length > 0 ? (
            <Link
              href="/notifications"
              className="focus-visible:ring-ring/50 rounded text-sm underline underline-offset-4 focus-visible:ring-3 focus-visible:outline-none"
            >
              查看全部动态
            </Link>
          ) : null}
        </div>

        {recentActivity.length === 0 ? (
          <p className="text-muted-foreground text-sm">还没有通知。</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {recentActivity.map((notice) => (
              <li
                key={notice.id}
                className="border-border flex flex-wrap items-center justify-between gap-2 border-b pb-2 text-sm last:border-0"
              >
                <span className="flex flex-wrap items-center gap-2">
                  {notice.readAt === null ? (
                    // 「未读」是 Active 家族：它是当前这一条，不是「成功」。
                    <StatusBadge tone="active">未读</StatusBadge>
                  ) : null}
                  {notice.title}
                </span>
                <span className="text-muted-foreground text-xs">
                  {localDateTime(notice.publishedAt, CLUB_DEFAULT_TIMEZONE)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
