import Link from "next/link";

import { MetaChip } from "@/components/domain/meta-chip";
import { StatePanel } from "@/components/domain/state-panel";
import { StatusBadge } from "@/components/domain/status-badge";
import { ballotStatusTone } from "@/components/domain/status-tone";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { AREA_ROLES } from "@/lib/auth/roles";
import { requireAnyRole } from "@/lib/auth/session";
import {
  ballotsDueCount,
  draftBallots,
  isBallotSubmitted,
  judgeAccessState,
  overdueBallots,
  partitionAssignments,
  recentlySubmitted,
  selectNextAssignment,
  type JudgeAccessState,
  type JudgeHomeMatch,
} from "@/lib/domain/judge-home";
import { CLUB_DEFAULT_TIMEZONE, utcToZonedLocal } from "@/lib/domain/timezone";
import { listMyAssignedMatches } from "@/lib/judge/ballots";
import { getMyJudgeProfile } from "@/lib/judge/profile";
import { BALLOT_STATUS_LABELS } from "@/lib/validation/ballot-submission";

export const metadata = { title: "Judge workspace · INSPIRA" };

export const dynamic = "force-dynamic";

/** 未获批准时给出的状态说明与下一步（规范 §9.1 要求"替换操作性内容"）。 */
const ACCESS_NOTICES: Record<
  Exclude<JudgeAccessState, "active">,
  { title: string; description: string; nextSteps: string[] }
> = {
  "no-profile": {
    title: "Your account has no judge profile yet",
    description:
      "Without a judge profile you cannot be assigned to a round, so there is nothing here yet.",
    nextSteps: [
      "Ask a club administrator to create a judge profile for you.",
      "After that, an administrator still has to approve it and grant format qualifications before you appear as a candidate for assignment.",
    ],
  },
  pending: {
    title: "Your judge application is still being reviewed",
    description:
      "Until it is approved you will not be assigned to any round, so there is nothing to do here. Nothing is broken, and there is no need to keep refreshing.",
    nextSteps: [
      "Wait for a club administrator to review it.",
      "After approval, an administrator also has to tick the formats you may judge.",
      "Once both are done, the rounds you are assigned to appear on this page.",
    ],
  },
  rejected: {
    title: "Your judge application was not approved",
    description: "You will not be assigned to any round.",
    nextSteps: [
      "If you think this is a mistake, contact a club administrator and explain.",
      "An administrator can review your profile again.",
    ],
  },
  suspended: {
    title: "Your judge account is suspended",
    description: "You will not be assigned new rounds while it is suspended.",
    nextSteps: ["Contact a club administrator to ask why, and what would restore it."],
  },
};

/** 时间按俱乐部默认时区显示 —— 与项目其它页面一致。 */
function localDateTime(iso: string): string {
  return utcToZonedLocal(new Date(iso), CLUB_DEFAULT_TIMEZONE).replace("T", " ");
}

/**
 * 裁判工作台（UI/UX 规范 §9.1）。
 *
 * ⚠️ 这一页改掉的是一个**会说假话的界面**。
 *
 * 原来它只有一句「我负责的比赛」加一个列表。未获批准的裁判被指派不了任何比赛，
 * 于是看到的是"目前没有指派给你的比赛 / 管理员指派之后，你会在这里看到要评分的比赛"——
 * 而真实原因是**申请还没批**。他会一直等一个永远不会来的指派。
 *
 * 规范 §9.1 的要求正好相反："If unapproved, replace operational content with
 * application status and next steps." 因此未获批准时这一页**只显示申请状态与下一步**，
 * 不显示待办数字（那些数字只会是 0，而且是误导性的 0）。
 */
export default async function JudgeHomePage() {
  await requireAnyRole(AREA_ROLES.judge);

  const [matches, profile] = await Promise.all([listMyAssignedMatches(), getMyJudgeProfile()]);
  const access = judgeAccessState(profile);

  if (access !== "active") {
    const notice = ACCESS_NOTICES[access];
    return (
      <div className="flex flex-col gap-6">
        <h1 className="text-h2 font-semibold tracking-tight">Judge workspace</h1>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">{notice.title}</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-3 text-sm">
            <p className="text-muted-foreground">{notice.description}</p>
            <div>
              <p className="font-medium">What happens next</p>
              <ol className="text-muted-foreground mt-1 list-decimal pl-5">
                {notice.nextSteps.map((step) => (
                  <li key={step}>{step}</li>
                ))}
              </ol>
            </div>
            <div className="flex flex-wrap gap-3 pt-1">
              <Button asChild variant="outline" size="sm">
                <Link href="/judge/profile">View my profile and judging philosophy</Link>
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  const now = new Date();
  const next = selectNextAssignment(matches);
  const due = ballotsDueCount(matches);
  const overdue = overdueBallots(matches, now);
  const drafts = draftBallots(matches);
  const recent = recentlySubmitted(matches);
  const { upcoming, completed } = partitionAssignments(matches);

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-h2 font-semibold tracking-tight">Judge workspace</h1>
          <p className="text-muted-foreground text-sm">
            You are assigned to {matches.length} rounds, and {due} still need a ballot.
          </p>
        </div>
        <Button asChild variant="outline" size="sm">
          <Link href="/judge/profile">My profile and philosophy</Link>
        </Button>
      </div>

      {/* ---------------- 下一场（规范：Lead with Next assignment） ---------------- */}
      {next ? (
        <section
          aria-labelledby="next-assignment-heading"
          className="bg-primary text-primary-foreground rounded-lg px-5 py-5 md:px-6 md:py-6"
        >
          <p className="text-xs font-medium tracking-wide opacity-80">Next up</p>
          <h2 id="next-assignment-heading" className="text-h3 mt-1 font-semibold">
            Round {next.matchNumber} · {next.roomName}
          </h2>
          <dl className="mt-4 flex flex-wrap gap-x-8 gap-y-3 text-sm">
            <div>
              <dt className="text-xs opacity-80">Time ({CLUB_DEFAULT_TIMEZONE})</dt>
              <dd>{localDateTime(next.scheduledStart)}</dd>
            </div>
            <div>
              <dt className="text-xs opacity-80">Format</dt>
              <dd>{next.formatCode}</dd>
            </div>
            <div>
              <dt className="text-xs opacity-80">My ballot</dt>
              <dd>
                {next.ballotStatus
                  ? (BALLOT_STATUS_LABELS[next.ballotStatus] ?? next.ballotStatus)
                  : "Not started yet"}
              </dd>
            </div>
          </dl>
          <div className="mt-5">
            {/*
              ⚠️ 没有模板时**不给按钮**，而是说明原因（原来那一页就是这么做的，
              这里保留）：让裁判点进一个空白页再发现"打不了分"是更差的体验。
            */}
            {next.hasTemplate ? (
              <Button asChild variant="secondary">
                <Link href={`/judge/matches/${next.matchId}`}>
                  {isBallotSubmitted(next)
                    ? "View ballot"
                    : next.ballotStatus === "draft"
                      ? "Continue the ballot"
                      : "Fill in the ballot"}
                </Link>
              </Button>
            ) : (
              <p className="text-sm" role="note">
                No ballot template is configured for this format. Ask an administrator.
              </p>
            )}
          </div>
        </section>
      ) : (
        <StatePanel
          variant="success"
          title="Every ballot is in"
          description="New assignments will appear here."
        />
      )}

      {/* ---------------- 待办数字 ---------------- */}
      {matches.length > 0 ? (
        <div className="grid gap-4 sm:grid-cols-3">
          <Card>
            <CardHeader>
              <CardTitle className="text-muted-foreground text-xs font-medium">
                Ballots to submit
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-h2 font-semibold">{due}</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle className="text-muted-foreground text-xs font-medium">
                Past the start time and still not submitted
              </CardTitle>
            </CardHeader>
            <CardContent className="flex items-center gap-2">
              <p className="text-h2 font-semibold">{overdue.length}</p>
              {overdue.length > 0 ? (
                <StatusBadge tone="danger">Deal with this soon</StatusBadge>
              ) : null}
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle className="text-muted-foreground text-xs font-medium">
                Started but not submitted
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-h2 font-semibold">{drafts.length}</p>
            </CardContent>
          </Card>
        </div>
      ) : null}

      {/* ---------------- 待办列表 ---------------- */}
      <section aria-labelledby="upcoming-heading" className="flex flex-col gap-3">
        <h2 id="upcoming-heading" className="text-title font-semibold">
          To do ({upcoming.length})
        </h2>
        {upcoming.length === 0 ? (
          <p className="text-muted-foreground text-sm">No ballots are waiting.</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {upcoming.map((match) => (
              <li key={match.matchId}>
                <AssignmentRow match={match} />
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* ---------------- 最近提交 ---------------- */}
      <section aria-labelledby="recent-heading" className="flex flex-col gap-3">
        <h2 id="recent-heading" className="text-title font-semibold">
          Recently submitted
        </h2>
        {recent.length === 0 ? (
          <p className="text-muted-foreground text-sm">No ballots submitted yet.</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {recent.map((match) => (
              <li key={match.matchId}>
                <AssignmentRow match={match} />
              </li>
            ))}
          </ul>
        )}
        {completed.length > recent.length ? (
          <p className="text-muted-foreground text-sm">
            {completed.length} ballots submitted in total. Only the most recent {recent.length} are
            shown here; the full list is under All assignments below.
          </p>
        ) : null}
      </section>

      {/* ---------------- 全部指派 ---------------- */}
      <section aria-labelledby="all-heading" className="flex flex-col gap-3">
        <h2 id="all-heading" className="text-title font-semibold">
          All assignments ({matches.length})
        </h2>
        {/*
          ⚠️ 规范 §9.2 要求这一份列表有 `Upcoming` / `Completed` 分段。
          这里先按"待办在前、已交在后"的**单一列表**呈现，并把分段切换留到
          §9.2 那一批（它同时还要求"冲突声明"，那是一个新功能，见 NEXT_STEP.md）。
        */}
        <ul className="flex flex-col">
          {[...upcoming, ...completed].map((match) => (
            <li key={match.matchId} className="border-border border-b last:border-0">
              <AssignmentRow match={match} dense />
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}

/** 一行指派。`dense` 用于"全部指派"那一节（信息密度更高，不重复按钮文案）。 */
function AssignmentRow({ match, dense = false }: { match: JudgeHomeMatch; dense?: boolean }) {
  const submitted = isBallotSubmitted(match);

  return (
    <div
      className={
        dense
          ? "flex flex-wrap items-center justify-between gap-x-4 gap-y-1 py-2"
          : "border-border flex flex-wrap items-center justify-between gap-3 rounded-md border px-3 py-3"
      }
    >
      <div className="flex min-w-0 flex-col gap-1">
        <div className="flex flex-wrap items-center gap-2">
          <strong className="text-sm">
            Round {match.matchNumber} · {match.roomName}
          </strong>
          <MetaChip>{match.formatCode}</MetaChip>
          <StatusBadge tone={match.ballotStatus ? ballotStatusTone(match.ballotStatus) : "neutral"}>
            {match.ballotStatus
              ? (BALLOT_STATUS_LABELS[match.ballotStatus] ?? match.ballotStatus)
              : "Not started yet"}
          </StatusBadge>
        </div>
        <span className="text-muted-foreground text-xs">{localDateTime(match.scheduledStart)}</span>
      </div>

      {match.hasTemplate ? (
        <Link
          href={`/judge/matches/${match.matchId}`}
          className="focus-visible:ring-ring/50 rounded text-sm underline underline-offset-4 focus-visible:ring-3 focus-visible:outline-none"
        >
          {submitted
            ? "View ballot"
            : match.ballotStatus === "draft"
              ? "Continue"
              : "Fill in the ballot"}
        </Link>
      ) : (
        <span className="text-destructive text-xs">
          No ballot template is configured for this format; ask an administrator
        </span>
      )}
    </div>
  );
}
