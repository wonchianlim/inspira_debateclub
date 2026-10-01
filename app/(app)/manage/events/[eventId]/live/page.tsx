import Link from "next/link";
import { notFound } from "next/navigation";

import { StatePanel } from "@/components/domain/state-panel";
import { MetaChip } from "@/components/domain/meta-chip";
import { StatusBadge } from "@/components/domain/status-badge";
import { liveStateTone } from "@/components/domain/status-tone";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getEventDetail } from "@/lib/admin/events";
import { LIVE_STATE_TEXT, getLiveDashboard } from "@/lib/admin/live";
import { AREA_ROLES } from "@/lib/auth/roles";
import { requireAnyRole } from "@/lib/auth/session";
import { liveStateUrgency } from "@/lib/domain/live-status";
import { CLUB_DEFAULT_TIMEZONE, utcToZonedLocal } from "@/lib/domain/timezone";

import { ManualCheckInButton } from "./live-controls";

export const metadata = { title: "现场看板 · INSPIRA" };

export const dynamic = "force-dynamic";

const URGENCY_LABELS = {
  "act-now": "需要立刻处理",
  attention: "留意",
  none: "",
} as const;

export default async function LivePage({ params }: { params: Promise<{ eventId: string }> }) {
  await requireAnyRole(AREA_ROLES.manage);
  const { eventId } = await params;

  const [event, dashboard] = await Promise.all([
    getEventDetail(eventId),
    getLiveDashboard(eventId),
  ]);
  if (!event) notFound();

  if (!dashboard) {
    return <StatePanel variant="error" title="读取现场看板失败" description="请刷新页面重试。" />;
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-semibold tracking-tight">现场看板 · {event.title}</h1>
        <div className="flex flex-wrap gap-2">
          <Button asChild variant="outline" size="sm">
            <Link href={`/manage/events/${event.id}/matches`}>比赛安排</Link>
          </Button>
          <Button asChild variant="outline" size="sm">
            <Link href={`/manage/events/${event.id}`}>返回活动</Link>
          </Button>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            签到情况（{dashboard.registrationCounts.checkedIn} /{" "}
            {dashboard.registrationCounts.total}）
          </CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-2 text-sm">
          <p>
            {dashboard.checkInOpen
              ? "签到已开放。"
              : `签到将在活动开始前 30 分钟开放（活动开始时间：${utcToZonedLocal(new Date(dashboard.eventStartsAt), CLUB_DEFAULT_TIMEZONE).replace("T", " ")}）。`}
          </p>
          <p className="text-muted-foreground text-xs">
            警告时刻：
            {utcToZonedLocal(new Date(dashboard.warningAt), CLUB_DEFAULT_TIMEZONE).replace(
              "T",
              " ",
            )}
            —— 过了这个时刻仍缺人的比赛会被标出来。
          </p>
        </CardContent>
      </Card>

      <dl className="grid gap-3 text-sm sm:grid-cols-4">
        {(
          [
            ["比赛总数", dashboard.counts.total, ""],
            ["已就绪", dashboard.counts.ready, ""],
            ["有缺人", dashboard.counts.warning, "需要立刻处理"],
            ["超时未开始", dashboard.counts.overdue, "需要立刻处理"],
          ] as const
        ).map(([label, value, hint]) => (
          <div key={label} className="border-border rounded-md border px-3 py-2">
            <dt className="text-muted-foreground text-xs">{label}</dt>
            <dd className="text-lg">{value}</dd>
            {hint && value > 0 ? <dd className="text-destructive text-xs">{hint}</dd> : null}
          </div>
        ))}
      </dl>

      {dashboard.matches.length === 0 ? (
        <StatePanel
          variant="empty"
          title="还没有比赛"
          description="先在「比赛安排」里生成比赛，现场看板才有内容。"
        />
      ) : (
        <div className="flex flex-col gap-4">
          {dashboard.matches.map((match) => {
            const urgency = liveStateUrgency(match.live.state);
            return (
              <Card
                key={match.matchId}
                className={urgency === "act-now" ? "border-destructive" : undefined}
              >
                <CardHeader>
                  <CardTitle className="flex flex-wrap items-center gap-2 text-base">
                    第 {match.matchNumber} 场 · {match.roomName}
                    <MetaChip>{match.formatCode}</MetaChip>
                    <StatusBadge tone={liveStateTone(match.live.state)}>
                      {LIVE_STATE_TEXT[match.live.state]}
                    </StatusBadge>
                    {match.live.overdue ? (
                      <StatusBadge tone="danger">超时未开始</StatusBadge>
                    ) : null}
                    {match.ironman ? <MetaChip>铁人</MetaChip> : null}
                  </CardTitle>
                </CardHeader>
                <CardContent className="flex flex-col gap-3 text-sm">
                  <p className="text-muted-foreground text-xs">
                    计划开始：
                    {utcToZonedLocal(new Date(match.scheduledStart), CLUB_DEFAULT_TIMEZONE).replace(
                      "T",
                      " ",
                    )}
                    {match.live.minutesUntilStart >= 0
                      ? `（还有 ${match.live.minutesUntilStart} 分钟）`
                      : `（已过 ${Math.abs(match.live.minutesUntilStart)} 分钟）`}
                  </p>

                  <p>
                    学生签到：{match.presentParticipants} / {match.requiredParticipants}
                    {match.missingStudents.length > 0 ? (
                      <span className="text-destructive">
                        {" "}
                        —— 还没到：{match.missingStudents.map((s) => s.displayName).join("、")}
                      </span>
                    ) : null}
                  </p>

                  <p>
                    裁判签到：{match.presentJudges} / {match.requiredJudges}
                    {match.requiredJudges === 0 ? (
                      <span className="text-destructive"> —— 还没有指派裁判</span>
                    ) : null}
                  </p>

                  {urgency !== "none" ? (
                    <p
                      className={
                        urgency === "act-now" ? "text-destructive" : "text-muted-foreground"
                      }
                    >
                      {URGENCY_LABELS[urgency]}
                      {match.live.missing.length > 0 ? `：${match.live.missing.join("、")}` : ""}
                    </p>
                  ) : null}

                  {match.missingStudents.length > 0 ? (
                    <div className="flex flex-col gap-2">
                      <p className="text-muted-foreground text-xs">
                        学生到现场后，可以在这里直接代他签到（会记录为「管理员代签」）：
                      </p>
                      <div className="flex flex-wrap items-start gap-2">
                        {match.missingStudents.map((student) => (
                          <ManualCheckInButton
                            key={student.studentId}
                            eventId={event.id}
                            studentId={student.studentId}
                            studentName={student.displayName}
                          />
                        ))}
                      </div>
                    </div>
                  ) : null}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
