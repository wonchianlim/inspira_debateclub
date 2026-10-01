import Link from "next/link";

import { MetaChip } from "@/components/domain/meta-chip";
import { StatePanel } from "@/components/domain/state-panel";
import { StatusBadge } from "@/components/domain/status-badge";
import { ballotStatusTone } from "@/components/domain/status-tone";
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

export const metadata = { title: "Ballots · INSPIRA" };

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
        <h1 className="text-h2 font-semibold tracking-tight">Ballots</h1>
        <Button asChild variant="outline" size="sm">
          <Link href={`/manage/events/${eventId}`}>Back to event</Link>
        </Button>
      </div>

      <ReviewRequestPanel eventId={eventId} requests={reviewRequests} />

      {ballots.length === 0 ? (
        <StatePanel
          variant="empty"
          title="No ballots yet"
          description="Once judges start filling them in, every round shows its progress here. You can review, ask for a correction, or publish."
        />
      ) : (
        <>
          {/*
            看板口径：`reopened` **不算**已交 —— 那正是它存在的意义。
            把它算成已交会让这里显示"全部交齐"而实际还差一份。
          */}
          <p className="text-muted-foreground text-sm">
            {ballots.length} ballots, {notSubmitted.length} not in yet
            {overdue.length > 0 ? `, ${overdue.length} overdue` : ""}.
          </p>

          {overdue.length > 0 ? (
            <Card className="border-destructive">
              <CardHeader>
                <CardTitle className="text-destructive text-base">
                  These ballots are overdue (more than 90 minutes after the round started)
                </CardTitle>
              </CardHeader>
              <CardContent className="flex flex-col gap-1 text-sm">
                {overdue.map((entry) => (
                  <div key={entry.ballot.ballotId}>
                    Round {entry.ballot.matchNumber} · {entry.ballot.roomName} (judge:
                    {entry.ballot.judgeName}) — {entry.overdue.minutesOverdue} minutes overdue
                  </div>
                ))}
                <p className="text-muted-foreground mt-1 text-xs">
                  Overdue is only a prompt; it blocks nothing. Contact the judge, or reopen the
                  ballot if you need to.
                </p>
              </CardContent>
            </Card>
          ) : null}

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Status by round</CardTitle>
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
                            Round {ballot.matchNumber} · {ballot.roomName}
                          </strong>
                          <MetaChip>{ballot.formatCode}</MetaChip>
                          <StatusBadge tone={ballotStatusTone(ballot.status)}>
                            {BALLOT_STATUS_TEXT[ballot.status]}
                          </StatusBadge>
                        </div>
                        <span className="text-muted-foreground text-xs">
                          Judge: {ballot.judgeName}
                          {ballot.scoreCount > 0 ? ` · ${ballot.scoreCount} scores entered` : ""}
                          {" · "}
                          {utcToZonedLocal(
                            new Date(ballot.scheduledStart),
                            CLUB_DEFAULT_TIMEZONE,
                          ).replace("T", " ")}
                        </span>
                      </div>

                      {ballot.status === "published" ? (
                        <span className="text-muted-foreground text-xs">
                          Submitted{" "}
                          {ballot.publishedAt
                            ? utcToZonedLocal(
                                new Date(ballot.publishedAt),
                                CLUB_DEFAULT_TIMEZONE,
                              ).replace("T", " ")
                            : "—"}{" "}
                          Publish
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
