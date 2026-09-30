import Link from "next/link";

import { StatePanel } from "@/components/domain/state-panel";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { listEventBallots, listEventReviewRequests } from "@/lib/admin/ballot-review";
import { AREA_ROLES } from "@/lib/auth/roles";
import { requireAnyRole } from "@/lib/auth/session";
import {
  BALLOT_STATUS_TEXT,
  availableBallotActions,
  isBallotSubmittedForDashboard,
} from "@/lib/domain/ballot-lifecycle";
import { checkBallotOverdue } from "@/lib/domain/ballot-overdue";
import { CLUB_DEFAULT_TIMEZONE, utcToZonedLocal } from "@/lib/domain/timezone";

import { ReviewButtons } from "./review-buttons";
import { ReviewRequestPanel } from "./review-request-panel";

export const metadata = { title: "评分表复核 · INSPIRA" };

export const dynamic = "force-dynamic";

export default async function EventBallotsPage({
  params,
}: {
  params: Promise<{ eventId: string }>;
}) {
  await requireAnyRole(AREA_ROLES.manage);
  const { eventId } = await params;

  const [ballots, reviewRequests] = await Promise.all([
    listEventBallots(eventId),
    listEventReviewRequests(eventId),
  ]);
  const notSubmitted = ballots.filter((ballot) => !isBallotSubmittedForDashboard(ballot.status));

  /*
   * 超时标记（P7-7）。
   *
   * ⚠️ 没有邮件服务商之前，这是**页面上的标记**而不是真的发信 ——
   * 但它的价值是一样的：让管理员一眼看到哪几场还差，
   * 而不是去逐条比对时间。
   */
  const now = new Date();
  const overdue = ballots
    .map((ballot) => ({
      ballot,
      overdue: checkBallotOverdue(new Date(ballot.scheduledStart), ballot.status, now),
    }))
    .filter((entry) => entry.overdue.overdue);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-semibold tracking-tight">评分表复核</h1>
        <Button asChild variant="outline" size="sm">
          <Link href={`/manage/events/${eventId}`}>返回活动</Link>
        </Button>
      </div>

      <ReviewRequestPanel eventId={eventId} requests={reviewRequests} />

      {ballots.length === 0 ? (
        <StatePanel
          variant="empty"
          title="还没有任何评分表"
          description="裁判开始填表之后，这里会显示每一场的进度，你可以复核、要求更正或发布。"
        />
      ) : (
        <>
          {/*
            看板口径：`reopened` **不算**已交 —— 那正是它存在的意义。
            把它算成已交会让这里显示"全部交齐"而实际还差一份。
          */}
          <p className="text-muted-foreground text-sm">
            共 {ballots.length} 份评分表，其中 {notSubmitted.length} 份还没交齐
            {overdue.length > 0 ? `，其中 ${overdue.length} 份已超时` : ""}。
          </p>

          {overdue.length > 0 ? (
            <Card className="border-destructive">
              <CardHeader>
                <CardTitle className="text-destructive text-base">
                  这些评分表已经超时（比赛开始超过 90 分钟仍未提交）
                </CardTitle>
              </CardHeader>
              <CardContent className="flex flex-col gap-1 text-sm">
                {overdue.map((entry) => (
                  <div key={entry.ballot.ballotId}>
                    第 {entry.ballot.matchNumber} 场 · {entry.ballot.roomName}（裁判：
                    {entry.ballot.judgeName}）—— 已超过 {entry.overdue.minutesOverdue} 分钟
                  </div>
                ))}
                <p className="text-muted-foreground mt-1 text-xs">
                  超时只是提示，不会阻止任何操作。请联系对应裁判，或在必要时重开评分表。
                </p>
              </CardContent>
            </Card>
          ) : null}

          <Card>
            <CardHeader>
              <CardTitle className="text-base">每一场的状态</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-3">
              {ballots.map((ballot) => {
                const managerActions = availableBallotActions(ballot.status, "manager");
                return (
                  <div
                    key={ballot.ballotId}
                    className="border-border flex flex-col gap-3 rounded-md border px-3 py-3"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div className="flex flex-col gap-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <strong className="text-sm">
                            第 {ballot.matchNumber} 场 · {ballot.roomName}
                          </strong>
                          <Badge variant="outline" className="font-normal">
                            {ballot.formatCode}
                          </Badge>
                          <Badge
                            variant={
                              isBallotSubmittedForDashboard(ballot.status) ? "secondary" : "outline"
                            }
                            className="font-normal"
                          >
                            {BALLOT_STATUS_TEXT[ballot.status]}
                          </Badge>
                        </div>
                        <span className="text-muted-foreground text-xs">
                          裁判：{ballot.judgeName}
                          {ballot.scoreCount > 0 ? ` · 已录入 ${ballot.scoreCount} 项分数` : ""}
                          {" · "}
                          {utcToZonedLocal(
                            new Date(ballot.scheduledStart),
                            CLUB_DEFAULT_TIMEZONE,
                          ).replace("T", " ")}
                        </span>
                      </div>

                      {ballot.status === "published" ? (
                        <span className="text-muted-foreground text-xs">
                          已于{" "}
                          {ballot.publishedAt
                            ? utcToZonedLocal(
                                new Date(ballot.publishedAt),
                                CLUB_DEFAULT_TIMEZONE,
                              ).replace("T", " ")
                            : "—"}{" "}
                          发布
                        </span>
                      ) : null}
                    </div>

                    <ReviewButtons
                      ballotId={ballot.ballotId}
                      matchId={ballot.matchId}
                      eventId={eventId}
                      canReopen={managerActions.some((action) => action.to === "reopened")}
                      canPublish={managerActions.some((action) => action.to === "published")}
                    />
                  </div>
                );
              })}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
