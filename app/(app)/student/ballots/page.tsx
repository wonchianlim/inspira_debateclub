import Link from "next/link";

import { StatePanel } from "@/components/domain/state-panel";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { AREA_ROLES } from "@/lib/auth/roles";
import { requireAnyRole } from "@/lib/auth/session";
import { CLUB_DEFAULT_TIMEZONE, utcToZonedLocal } from "@/lib/domain/timezone";
import { listMyPublishedBallots } from "@/lib/student/ballots";

import { ReviewRequestForm } from "./review-request-form";

export const metadata = { title: "我的评分表 · INSPIRA" };

export const dynamic = "force-dynamic";

export default async function StudentBallotsPage() {
  await requireAnyRole(AREA_ROLES.student);
  const ballots = await listMyPublishedBallots();

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-xl font-semibold tracking-tight">我的评分表</h1>

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
                    <Badge variant="outline" className="font-normal">
                      {ballot.formatCode}
                    </Badge>
                    <Badge variant="outline" className="font-normal">
                      {ballot.myTeamLabel}
                    </Badge>
                    {/*
                      BP 用排名而不是胜负，因此这里在没有胜方时要显示名次。
                      否则 BP 的学生会看到一片空白，以为系统坏了。
                    */}
                    {ballot.myRank !== null ? (
                      <Badge variant="secondary">第 {ballot.myRank} 名</Badge>
                    ) : ballot.outcome ? (
                      <Badge variant={ballot.outcome === "win" ? "default" : "outline"}>
                        {ballot.outcome === "win" ? "胜" : "负"}
                      </Badge>
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
