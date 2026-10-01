import Link from "next/link";

import { MetaChip } from "@/components/domain/meta-chip";
import { StatePanel } from "@/components/domain/state-panel";
import { StatusBadge } from "@/components/domain/status-badge";
import { auditActionTone, eventStatusTone } from "@/components/domain/status-tone";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { AUDIT_ACTION_LABELS, AUDIT_ENTITY_LABELS, listAuditEntries } from "@/lib/admin/audit";
import { listEventBallots, listEventReviewRequests } from "@/lib/admin/ballot-review";
import { getEmailOutbox } from "@/lib/admin/email-outbox";
import { listEvents } from "@/lib/admin/events";
import { listEventMatches } from "@/lib/admin/matches";
import { listEventRegistrations } from "@/lib/admin/registrations";
import { AREA_ROLES } from "@/lib/auth/roles";
import { requireAnyRole } from "@/lib/auth/session";
import {
  needsAttention,
  selectFollowingEvents,
  selectOperationalEvent,
  type FeaturedEventSnapshot,
} from "@/lib/domain/club-admin-home";
import { EVENT_STATUS_LABELS } from "@/lib/domain/event-lifecycle";
import { CLUB_DEFAULT_TIMEZONE, utcToZonedLocal } from "@/lib/domain/timezone";

export const metadata = { title: "俱乐部管理 · INSPIRA" };

export const dynamic = "force-dynamic";

/** 已经交上来的评分表状态（含已发布）。 */
const SUBMITTED_BALLOT_STATUSES: readonly string[] = ["submitted", "resubmitted", "published"];

function localDateTime(iso: string): string {
  return utcToZonedLocal(new Date(iso), CLUB_DEFAULT_TIMEZONE).replace("T", " ");
}

/**
 * 俱乐部管理首页（UI/UX 规范 §11.1）。
 *
 * ⚠️ 这一页原来**一个字的数据都没有** —— 它只是几张写着区域名字的卡片
 * （"活动管理 / 通知管理 / 报名管理……"），管理员从这里出发还得自己猜先去哪。
 * 规范要的是**运营看板**：当前要盯的那一场 + 它的数字、
 * **需要处理**（每一条都能点进去解决）、接下来的活动、最近的管理操作。
 *
 * ⚠️ 已知取舍（改的时候别以为漏了）：与活动相关的"需要处理"**只看被选中的那一场**，
 * 不扫全部活动。扫全部的话每场要四轮查询（报名/比赛/评分表/复核），
 * 活动一多就是几十次请求；而管理员真正在办的就是这一场。
 * 跨活动的检查只有"邮件发送失败"（它本来就是全局的）。
 */
export default async function ClubAdminHomePage() {
  await requireAnyRole(AREA_ROLES.manage);

  const now = new Date();
  const [events, outbox, audit] = await Promise.all([
    listEvents(),
    getEmailOutbox(20),
    listAuditEntries({}),
  ]);

  const operational = selectOperationalEvent(events, now);
  const featuredEvent = operational.event;

  /** 被选中那一场的运营数据。四个读取并行，且只对这一场做。 */
  let featured: FeaturedEventSnapshot | null = null;
  if (featuredEvent) {
    const [registrations, matches, ballots, reviews] = await Promise.all([
      listEventRegistrations(featuredEvent.id),
      listEventMatches(featuredEvent.id),
      listEventBallots(featuredEvent.id),
      listEventReviewRequests(featuredEvent.id),
    ]);

    const activeRegistrations = registrations.filter(
      (row) => row.status === "registered" || row.status === "checked_in",
    );

    featured = {
      eventId: featuredEvent.id,
      registeredCount: activeRegistrations.length,
      registrationIssueCount: activeRegistrations.filter((row) => row.issues.length > 0).length,
      matchCount: matches.length,
      unassignedJudgeMatchCount: matches.filter((match) => match.judges.length === 0).length,
      ballotsUnsubmittedCount: ballots.filter(
        (ballot) => !SUBMITTED_BALLOT_STATUSES.includes(ballot.status),
      ).length,
      ballotsExpectedCount: matches.filter((match) => match.judges.length > 0).length,
      unresolvedReviewCount: reviews.filter(
        (review) => review.status === "open" || review.status === "reviewing",
      ).length,
    };
  }

  const attention = needsAttention({
    events,
    featured,
    failedEmailCount: outbox.failed,
    now,
  });
  const following = selectFollowingEvents(events, now, featuredEvent?.id ?? null);
  const recentActivity = audit.slice(0, 6);

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-h2 font-semibold tracking-tight">俱乐部管理</h1>
          <p className="text-muted-foreground text-sm">办活动、处理问题，让辩论社正常运转。</p>
        </div>
        <Button asChild>
          <Link href="/manage/events/new">新建活动</Link>
        </Button>
      </div>

      {/* ---------------- 当前要盯的那一场 ---------------- */}
      {featuredEvent && featured ? (
        <section aria-labelledby="operational-heading" className="flex flex-col gap-3">
          <h2 id="operational-heading" className="text-title font-semibold">
            {operational.kind === "in-progress" ? "正在进行" : "下一场"}
          </h2>

          <Card>
            <CardContent className="flex flex-col gap-4 pt-6">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-medium">{featuredEvent.title}</span>
                <StatusBadge tone={eventStatusTone(featuredEvent.status)}>
                  {EVENT_STATUS_LABELS[featuredEvent.status] ?? featuredEvent.status}
                </StatusBadge>
                <MetaChip>{featuredEvent.eventDate}</MetaChip>
              </div>

              {/*
                规范列的四个指标：debaters / judges / rooms / unresolved issues。
                「评分表（已交 / 应交）」比单纯一个裁判数字更有用：
                应交 = 有裁判的比赛数，已交 = 应交减去没交的。
              */}
              <dl className="grid gap-3 text-sm sm:grid-cols-4">
                <div>
                  <dt className="text-muted-foreground text-xs">报名（有效）</dt>
                  <dd className="text-h3 font-semibold">{featured.registeredCount}</dd>
                </div>
                <div>
                  <dt className="text-muted-foreground text-xs">已排比赛</dt>
                  <dd className="text-h3 font-semibold">{featured.matchCount}</dd>
                </div>
                <div>
                  <dt className="text-muted-foreground text-xs">评分表（已交 / 应交）</dt>
                  <dd className="text-h3 font-semibold">
                    {featured.ballotsExpectedCount - featured.ballotsUnsubmittedCount} /{" "}
                    {featured.ballotsExpectedCount}
                  </dd>
                </div>
                <div>
                  <dt className="text-muted-foreground text-xs">需要处理</dt>
                  <dd className="text-h3 font-semibold">{attention.length}</dd>
                </div>
              </dl>

              <div className="flex flex-wrap items-center gap-3">
                <Button asChild size="sm">
                  <Link href={`/manage/events/${featuredEvent.id}`}>管理这场活动</Link>
                </Button>
                <span className="text-muted-foreground text-xs">
                  开始时间：{localDateTime(featuredEvent.startsAt)}（{CLUB_DEFAULT_TIMEZONE}）
                </span>
              </div>
            </CardContent>
          </Card>
        </section>
      ) : events.length === 0 ? (
        <StatePanel
          variant="empty"
          title="还没有任何活动"
          description="先建一场活动：填好时间与赛制，再推进到「报名开放中」，学生就能报名了。"
          action={
            <Button asChild variant="outline" size="sm">
              <Link href="/manage/events/new">新建活动</Link>
            </Button>
          }
        />
      ) : null}

      {/* ---------------- 需要处理 ---------------- */}
      <section aria-labelledby="attention-heading" className="flex flex-col gap-3">
        <h2 id="attention-heading" className="text-title font-semibold">
          需要处理
        </h2>
        {attention.length === 0 ? (
          <p className="text-muted-foreground text-sm">
            没有需要你处理的事。{featuredEvent ? "这一场目前一切正常。" : ""}
          </p>
        ) : (
          <ul className="flex flex-col gap-2">
            {attention.map((item) => (
              <li
                key={item.key}
                className="border-border flex flex-wrap items-center justify-between gap-x-4 gap-y-2 rounded-md border px-3 py-2 text-sm"
              >
                <span className="flex flex-wrap items-center gap-2">
                  <StatusBadge tone={item.severity === "high" ? "danger" : "warning"}>
                    {item.severity === "high" ? "尽快" : "待办"}
                  </StatusBadge>
                  {item.label}
                </span>
                {/* 规范的硬要求：每一条都能点进去解决 */}
                <Link
                  href={item.href}
                  className="focus-visible:ring-ring/50 rounded underline underline-offset-4 focus-visible:ring-3 focus-visible:outline-none"
                >
                  去处理
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* ---------------- 接下来的活动 ---------------- */}
      <section aria-labelledby="following-heading" className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 id="following-heading" className="text-title font-semibold">
            接下来的活动
          </h2>
          <Link
            href="/manage/events"
            className="focus-visible:ring-ring/50 rounded text-sm underline underline-offset-4 focus-visible:ring-3 focus-visible:outline-none"
          >
            全部活动
          </Link>
        </div>

        {following.length === 0 ? (
          <p className="text-muted-foreground text-sm">之后暂时没有别的活动。</p>
        ) : (
          <ul className="flex flex-col">
            {following.map((event) => (
              <li
                key={event.id}
                className="border-border flex flex-wrap items-center justify-between gap-x-4 gap-y-1 border-b py-2 text-sm last:border-0"
              >
                <span className="flex flex-wrap items-center gap-2">
                  <span className="font-medium">{event.title}</span>
                  <StatusBadge tone={eventStatusTone(event.status)}>
                    {EVENT_STATUS_LABELS[event.status] ?? event.status}
                  </StatusBadge>
                </span>
                <span className="text-muted-foreground text-xs">
                  {event.eventDate} · {localDateTime(event.startsAt)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* ---------------- 最近的管理操作 ---------------- */}
      <section aria-labelledby="activity-heading" className="flex flex-col gap-3">
        <h2 id="activity-heading" className="text-title font-semibold">
          最近的管理操作
        </h2>
        {recentActivity.length === 0 ? (
          <p className="text-muted-foreground text-sm">还没有产生审计记录。</p>
        ) : (
          <ul className="flex flex-col gap-2 text-sm">
            {recentActivity.map((entry) => (
              <li key={entry.id} className="flex flex-wrap items-center gap-2">
                <StatusBadge tone={auditActionTone(entry.action)}>
                  {AUDIT_ACTION_LABELS[entry.action] ?? entry.action}
                </StatusBadge>
                <span>{AUDIT_ENTITY_LABELS[entry.entityType] ?? entry.entityType}</span>
                <span className="text-muted-foreground text-xs">
                  {entry.actorName ?? "（系统操作，无操作者）"} · {localDateTime(entry.createdAt)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* ---------------- 常去的几处 ---------------- */}
      <section aria-labelledby="shortcuts-heading" className="flex flex-col gap-3">
        <h2 id="shortcuts-heading" className="text-title font-semibold">
          常去的几处
        </h2>
        <ul className="flex flex-wrap gap-2">
          {[
            { href: "/manage/events", label: "活动管理" },
            { href: "/manage/notices", label: "通知管理" },
            { href: "/admin/users", label: "用户管理" },
            { href: "/admin/email", label: "邮件队列" },
            { href: "/admin/audit", label: "审计日志" },
          ].map((entry) => (
            <li key={entry.href}>
              <Button asChild variant="outline" size="sm">
                <Link href={entry.href}>{entry.label}</Link>
              </Button>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
