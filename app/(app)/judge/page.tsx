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

export const metadata = { title: "裁判工作台 · INSPIRA" };

export const dynamic = "force-dynamic";

/** 未获批准时给出的状态说明与下一步（规范 §9.1 要求"替换操作性内容"）。 */
const ACCESS_NOTICES: Record<
  Exclude<JudgeAccessState, "active">,
  { title: string; description: string; nextSteps: string[] }
> = {
  "no-profile": {
    title: "你的账号还没有裁判档案",
    description: "没有裁判档案就无法被指派比赛，因此这里暂时没有可做的事。",
    nextSteps: [
      "请联系俱乐部管理员为你建立裁判档案。",
      "档案建立后，管理员还需要审批并授予赛制资格，你才会出现在指派候选里。",
    ],
  },
  pending: {
    title: "你的裁判申请还在审批中",
    description:
      "审批通过之前，你不会被指派到任何比赛，因此这里没有待办。这不是系统出错，也不需要你反复刷新。",
    nextSteps: [
      "等待俱乐部管理员审批。",
      "审批通过后，管理员还需要为你勾选可以执裁的赛制。",
      "这两件事都完成之后，被指派的比赛会出现在这一页。",
    ],
  },
  rejected: {
    title: "你的裁判申请没有通过",
    description: "因此你不会被指派到任何比赛。",
    nextSteps: ["如果你认为这是误判，请联系俱乐部管理员说明情况。", "管理员可以重新审批你的档案。"],
  },
  suspended: {
    title: "你的裁判账号已被暂停",
    description: "暂停期间不会被指派新的比赛。",
    nextSteps: ["请联系俱乐部管理员了解原因与恢复条件。"],
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
        <h1 className="text-h2 font-semibold tracking-tight">裁判工作台</h1>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">{notice.title}</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-3 text-sm">
            <p className="text-muted-foreground">{notice.description}</p>
            <div>
              <p className="font-medium">接下来会发生什么</p>
              <ol className="text-muted-foreground mt-1 list-decimal pl-5">
                {notice.nextSteps.map((step) => (
                  <li key={step}>{step}</li>
                ))}
              </ol>
            </div>
            <div className="flex flex-wrap gap-3 pt-1">
              <Button asChild variant="outline" size="sm">
                <Link href="/judge/profile">查看我的档案与执裁理念</Link>
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
          <h1 className="text-h2 font-semibold tracking-tight">裁判工作台</h1>
          <p className="text-muted-foreground text-sm">
            你被指派了 {matches.length} 场比赛，其中 {due} 场还没提交评分表。
          </p>
        </div>
        <Button asChild variant="outline" size="sm">
          <Link href="/judge/profile">我的档案与理念</Link>
        </Button>
      </div>

      {/* ---------------- 下一场（规范：Lead with Next assignment） ---------------- */}
      {next ? (
        <section
          aria-labelledby="next-assignment-heading"
          className="bg-primary text-primary-foreground rounded-lg px-5 py-5 md:px-6 md:py-6"
        >
          <p className="text-xs font-medium tracking-wide opacity-80">下一场</p>
          <h2 id="next-assignment-heading" className="text-h3 mt-1 font-semibold">
            第 {next.matchNumber} 场 · {next.roomName}
          </h2>
          <dl className="mt-4 flex flex-wrap gap-x-8 gap-y-3 text-sm">
            <div>
              <dt className="text-xs opacity-80">时间（{CLUB_DEFAULT_TIMEZONE}）</dt>
              <dd>{localDateTime(next.scheduledStart)}</dd>
            </div>
            <div>
              <dt className="text-xs opacity-80">赛制</dt>
              <dd>{next.formatCode}</dd>
            </div>
            <div>
              <dt className="text-xs opacity-80">我的评分表</dt>
              <dd>
                {next.ballotStatus
                  ? (BALLOT_STATUS_LABELS[next.ballotStatus] ?? next.ballotStatus)
                  : "尚未开始填写"}
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
                    ? "查看评分表"
                    : next.ballotStatus === "draft"
                      ? "继续填写评分表"
                      : "填写评分表"}
                </Link>
              </Button>
            ) : (
              <p className="text-sm" role="note">
                这个赛制还没有配置评分表模板，请联系管理员。
              </p>
            )}
          </div>
        </section>
      ) : (
        <StatePanel
          variant="success"
          title="手上的评分表都交齐了"
          description="接下来如果有新的指派，会出现在这里。"
        />
      )}

      {/* ---------------- 待办数字 ---------------- */}
      {matches.length > 0 ? (
        <div className="grid gap-4 sm:grid-cols-3">
          <Card>
            <CardHeader>
              <CardTitle className="text-muted-foreground text-xs font-medium">
                待提交的评分表
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-h2 font-semibold">{due}</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle className="text-muted-foreground text-xs font-medium">
                已过开始时间仍未提交
              </CardTitle>
            </CardHeader>
            <CardContent className="flex items-center gap-2">
              <p className="text-h2 font-semibold">{overdue.length}</p>
              {overdue.length > 0 ? <StatusBadge tone="danger">需要尽快处理</StatusBadge> : null}
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle className="text-muted-foreground text-xs font-medium">
                开了头还没交
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
          待办（{upcoming.length}）
        </h2>
        {upcoming.length === 0 ? (
          <p className="text-muted-foreground text-sm">没有待提交的评分表。</p>
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
          最近提交
        </h2>
        {recent.length === 0 ? (
          <p className="text-muted-foreground text-sm">还没有提交过评分表。</p>
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
            已提交的评分表共 {completed.length} 份 —— 这里只显示最近 {recent.length} 份，
            下面「全部指派」里有完整列表。
          </p>
        ) : null}
      </section>

      {/* ---------------- 全部指派 ---------------- */}
      <section aria-labelledby="all-heading" className="flex flex-col gap-3">
        <h2 id="all-heading" className="text-title font-semibold">
          全部指派（{matches.length}）
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
            第 {match.matchNumber} 场 · {match.roomName}
          </strong>
          <MetaChip>{match.formatCode}</MetaChip>
          <StatusBadge tone={match.ballotStatus ? ballotStatusTone(match.ballotStatus) : "neutral"}>
            {match.ballotStatus
              ? (BALLOT_STATUS_LABELS[match.ballotStatus] ?? match.ballotStatus)
              : "尚未开始填写"}
          </StatusBadge>
        </div>
        <span className="text-muted-foreground text-xs">{localDateTime(match.scheduledStart)}</span>
      </div>

      {match.hasTemplate ? (
        <Link
          href={`/judge/matches/${match.matchId}`}
          className="focus-visible:ring-ring/50 rounded text-sm underline underline-offset-4 focus-visible:ring-3 focus-visible:outline-none"
        >
          {submitted ? "查看评分表" : match.ballotStatus === "draft" ? "继续填写" : "填写评分表"}
        </Link>
      ) : (
        <span className="text-destructive text-xs">这个赛制还没有配置评分表模板，请联系管理员</span>
      )}
    </div>
  );
}
