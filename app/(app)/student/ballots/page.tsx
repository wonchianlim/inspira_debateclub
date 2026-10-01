import Link from "next/link";

import { MetaChip } from "@/components/domain/meta-chip";
import { StatePanel } from "@/components/domain/state-panel";
import { StatusBadge } from "@/components/domain/status-badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { AREA_ROLES } from "@/lib/auth/roles";
import { requireAnyRole } from "@/lib/auth/session";
import { CLUB_DEFAULT_TIMEZONE, utcToZonedLocal } from "@/lib/domain/timezone";
import { listMyPublishedBallots, toHistoryEntries } from "@/lib/student/ballots";
import { MIN_DEBATES_FOR_TREND, summarizeStudentHistory } from "@/lib/domain/student-history";

import { ReviewRequestForm } from "./review-request-form";

export const metadata = { title: "我的评分表 · INSPIRA" };

export const dynamic = "force-dynamic";

export default async function StudentBallotsPage() {
  await requireAnyRole(AREA_ROLES.student);
  const ballots = await listMyPublishedBallots();
  const history = summarizeStudentHistory(toHistoryEntries(ballots));

  const trendText: Record<string, string> = {
    up: `最近几场比之前平均高 ${history.recentTrend.delta} 分`,
    down: `最近几场比之前平均低 ${Math.abs(history.recentTrend.delta ?? 0)} 分`,
    flat: "最近几场与之前大致持平",
    unknown: "",
  };

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-xl font-semibold tracking-tight">我的评分表</h1>

      {/*
        历史统计。规范要求"先不要做公开排名，这些分数主要用于个人成长" ——
        因此这里只有这位学生**自己的纵向变化**，没有任何与他人比较的内容。
      */}
      {ballots.length > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">我的成长</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-3 text-sm">
            <div className="flex flex-wrap gap-x-8 gap-y-2">
              <span>
                辩论场次
                <strong className="ml-1">{history.totalDebates}</strong>
              </span>
              {history.winRate !== null ? (
                <span>
                  胜负
                  <strong className="ml-1">
                    {history.wins} 胜 {history.losses} 负
                  </strong>
                  <span className="text-muted-foreground ml-1 text-xs">
                    （胜率 {history.winRate}%）
                  </span>
                </span>
              ) : null}
              {history.rankedOnly > 0 ? (
                <span className="text-muted-foreground">
                  另有 {history.rankedOnly} 场按名次排名
                </span>
              ) : null}
              {history.averageTotal !== null ? (
                <span>
                  平均分
                  <strong className="ml-1">{history.averageTotal}</strong>
                </span>
              ) : null}
              {history.highestTotal !== null ? (
                <span>
                  最高分
                  <strong className="ml-1">{history.highestTotal}</strong>
                </span>
              ) : null}
            </div>

            {history.recentTrend.direction !== "unknown" ? (
              <p className="text-muted-foreground">{trendText[history.recentTrend.direction]}</p>
            ) : (
              /*
                样本不足时**明说**不判断趋势，而不是给一个基于两三场的结论。
                规范没有规定场次，这个门槛写在领域模块里并注明了理由。
              */
              <p className="text-muted-foreground">
                再打 {Math.max(0, MIN_DEBATES_FOR_TREND - history.recentTrend.sampleSize)} 场之后，
                这里会显示你的变化趋势。场次太少时给结论会误导人，所以现在不判断。
              </p>
            )}

            {history.categoryAverages.length > 0 ? (
              <div className="flex flex-col gap-2">
                <p className="text-muted-foreground text-xs">
                  各赛制的分项平均是**分开**的 —— 不同赛制的满分不同，混在一起没有意义。
                </p>
                {history.categoryAverages.map((group) => (
                  <div key={group.formatCode}>
                    <strong className="text-xs">{group.formatCode}</strong>
                    <div className="flex flex-wrap gap-x-6">
                      {group.items.map((item) => (
                        <span key={item.key} className="text-sm">
                          {item.label}
                          <strong className="ml-1">
                            {item.average} / {item.max}
                          </strong>
                        </span>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            ) : null}
          </CardContent>
        </Card>
      ) : null}

      {ballots.length === 0 ? (
        <StatePanel
          variant="empty"
          title="还没有已发布的评分表"
          description="裁判提交之后由管理员发布，发布后你就能在这里看到自己的分数、判决理由与反馈。"
        />
      ) : (
        <>
          <p className="text-muted-foreground text-sm">
            这里是**已发布**的评分表。未发布的评分表还看不到 —— 因为裁判可能还在修改。
          </p>

          {ballots.map((ballot) => (
            <Card key={ballot.ballotId}>
              <CardHeader>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <CardTitle className="text-base">
                    第 {ballot.matchNumber} 场 · {ballot.roomName}
                  </CardTitle>
                  <div className="flex flex-wrap items-center gap-2">
                    {/*
                      赛制代码与队伍名是**属性**，不是状态 —— 用中性标签，
                      不染语义色（规范 §5.2 禁止把语义色当装饰）。
                    */}
                    <MetaChip>{ballot.formatCode}</MetaChip>
                    <MetaChip>{ballot.myTeamLabel}</MetaChip>
                    {/*
                      BP 用排名而不是胜负，因此这里在没有胜方时要显示名次。
                      否则 BP 的学生会看到一片空白，以为系统坏了。
                      名次是**数据**不是"成功" —— 绿色只留给胜利。
                    */}
                    {ballot.myRank !== null ? (
                      <StatusBadge>第 {ballot.myRank} 名</StatusBadge>
                    ) : ballot.outcome ? (
                      <StatusBadge tone={ballot.outcome === "win" ? "success" : "neutral"}>
                        {ballot.outcome === "win" ? "胜" : "负"}
                      </StatusBadge>
                    ) : null}
                  </div>
                </div>
                <p className="text-muted-foreground text-xs">
                  {utcToZonedLocal(new Date(ballot.scheduledStart), CLUB_DEFAULT_TIMEZONE).replace(
                    "T",
                    " ",
                  )}
                  {ballot.templateName ? ` · 使用模板：${ballot.templateName}` : ""}
                </p>
              </CardHeader>

              <CardContent className="flex flex-col gap-4 text-sm">
                {/* ---- 我的分数 ---- */}
                {ballot.myScores.length > 0 ? (
                  <div>
                    <h2 className="mb-1 text-sm font-medium">我的分数</h2>
                    <div className="flex flex-wrap gap-x-6 gap-y-1">
                      {ballot.myScores.map((score) => (
                        <span key={score.key}>
                          {score.label}
                          <strong className="ml-1">{score.value}</strong>
                        </span>
                      ))}
                    </div>
                    {ballot.myTotals.map((total) => (
                      <p key={total.key} className="mt-1">
                        {total.label}
                        <strong className="ml-1 text-base">
                          {total.value} / {total.max}
                        </strong>
                      </p>
                    ))}
                  </div>
                ) : null}

                {/* ---- 两队总分 ---- */}
                {ballot.sideTotals.some((side) => side.total !== null) ? (
                  <div>
                    <h2 className="mb-1 text-sm font-medium">两队总分</h2>
                    <div className="flex flex-wrap gap-x-6">
                      {ballot.sideTotals.map((side) => (
                        <span key={side.teamId}>
                          {side.label}
                          <strong className="ml-1">{side.total ?? "—"}</strong>
                          {side.teamId === ballot.myTeamId ? (
                            <span className="text-muted-foreground ml-1 text-xs">（我方）</span>
                          ) : null}
                        </span>
                      ))}
                    </div>
                  </div>
                ) : null}

                {/* ---- 判决理由 / 排名理由 ---- */}
                {ballot.matchText.map((entry) => (
                  <div key={entry.key}>
                    <h2 className="mb-1 text-sm font-medium">{entry.label}</h2>
                    <p className="whitespace-pre-wrap">{entry.value}</p>
                  </div>
                ))}

                {/* ---- 交锋 ---- */}
                {ballot.matchLists.map((list) => (
                  <div key={list.key}>
                    <h2 className="mb-1 text-sm font-medium">{list.label}</h2>
                    <ul className="list-disc pl-5">
                      {list.entries.map((entry, index) => (
                        <li key={index}>{entry}</li>
                      ))}
                    </ul>
                  </div>
                ))}

                {/* ---- 我方论点 ---- */}
                {ballot.teamLists.map((list) => (
                  <div key={list.key}>
                    <h2 className="mb-1 text-sm font-medium">
                      {ballot.myTeamLabel}的{list.label}
                    </h2>
                    <ul className="list-disc pl-5">
                      {list.entries.map((entry, index) => (
                        <li key={index}>{entry}</li>
                      ))}
                    </ul>
                  </div>
                ))}

                {/* ---- 队伍反馈 ---- */}
                {ballot.teamFeedback.length > 0 ? (
                  <div>
                    <h2 className="mb-1 text-sm font-medium">给{ballot.myTeamLabel}的反馈</h2>
                    {ballot.teamFeedback.map((entry) => (
                      <p key={entry.key} className="mb-1">
                        <span className="text-muted-foreground">{entry.label}：</span>
                        {entry.value}
                      </p>
                    ))}
                  </div>
                ) : null}

                {/* 复核请求：同一份评分表只能提一次（数据库唯一约束强制） */}
                <div className="border-border border-t pt-3">
                  <ReviewRequestForm
                    ballotId={ballot.ballotId}
                    existingStatus={ballot.reviewStatus}
                  />
                </div>
              </CardContent>
            </Card>
          ))}
        </>
      )}

      <Button asChild variant="outline" size="sm" className="self-start">
        <Link href="/student">返回学生区域</Link>
      </Button>
    </div>
  );
}
