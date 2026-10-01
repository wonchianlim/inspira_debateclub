import Link from "next/link";

import { BallotDocument } from "@/components/domain/ballot-document";
import { StatePanel } from "@/components/domain/state-panel";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { AREA_ROLES } from "@/lib/auth/roles";
import { requireAnyRole } from "@/lib/auth/session";
import { MIN_DEBATES_FOR_TREND, summarizeStudentHistory } from "@/lib/domain/student-history";
import { groupPublishedBallots } from "@/lib/domain/student-ballots-view";
import { CLUB_DEFAULT_TIMEZONE } from "@/lib/domain/timezone";
import { listMyPublishedBallots, toHistoryEntries } from "@/lib/student/ballots";

import { ReviewRequestForm } from "./review-request-form";

export const metadata = { title: "我的评分表 · INSPIRA" };

export const dynamic = "force-dynamic";

/**
 * 我的评分表（UI/UX 规范 §8.7「Feedback index and detail」）。
 *
 * ⚠️ 这一页原来是"卡片堆"：一份评分表把个人分、两队总分、判决理由、交锋、
 * 论点、队伍反馈六类东西平铺在一张卡上，全是 `label：value` 段落。
 * 现在每一份评分表是一个**可读的文件**（见 `BallotDocument`），
 * 并且按**比赛**分组 —— 一场比赛可以有多位裁判的评分表，
 * 原来三张几乎一样的卡片摆在一起、没有任何说明，看起来像系统坏了。
 *
 * ⚠️ 关于打印：规范要求 "Print view must be clean and omit navigation"。
 * 导航与页脚由应用外壳统一加 `print:hidden`（见 `components/layout/app-shell.tsx`），
 * 这一页只需要把**动作类**的东西也标上（复核表单、返回按钮）。
 * 分数与裁判写的字是**内容**，打印时必须保留。
 */
export default async function StudentBallotsPage() {
  await requireAnyRole(AREA_ROLES.student);
  const ballots = await listMyPublishedBallots();
  const history = summarizeStudentHistory(toHistoryEntries(ballots));
  const groups = groupPublishedBallots(ballots);

  const trendText: Record<string, string> = {
    up: `最近几场比之前平均高 ${history.recentTrend.delta} 分`,
    down: `最近几场比之前平均低 ${Math.abs(history.recentTrend.delta ?? 0)} 分`,
    flat: "最近几场与之前大致持平",
    unknown: "",
  };

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-h2 font-semibold tracking-tight">我的评分表</h1>
          <p className="text-muted-foreground text-sm">
            裁判提交、管理员发布之后，你就能在这里看到自己的分数与反馈。
          </p>
        </div>
        <Button asChild variant="outline" size="sm" className="print:hidden">
          <Link href="/student">返回我的辩论社</Link>
        </Button>
      </div>

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
        <section aria-labelledby="ballots-heading" className="flex flex-col gap-6">
          <h2 id="ballots-heading" className="text-title font-semibold">
            已发布的评分表（{ballots.length} 份）
          </h2>

          {groups.map((group) => (
            <section
              key={group.matchId}
              aria-label={`第 ${group.documents[0]?.ballot.matchNumber ?? ""} 场`}
              className="flex flex-col gap-3"
            >
              {group.documents.length > 1 ? (
                <p className="text-muted-foreground text-sm" role="note">
                  这一场有 <strong className="text-foreground">{group.documents.length}</strong>{" "}
                  位裁判的评分表。它们都是有效的记录，分数不同是正常的 ——
                  下面按裁判分开列出（不公开裁判姓名）。
                </p>
              ) : null}

              {group.documents.map(({ ballot, anonymousLabel }) => (
                <BallotDocument
                  key={ballot.ballotId}
                  ballot={ballot}
                  anonymousLabel={anonymousLabel}
                  reviewSlot={
                    <ReviewRequestForm
                      ballotId={ballot.ballotId}
                      existingStatus={ballot.reviewStatus}
                    />
                  }
                />
              ))}
            </section>
          ))}

          <p className="text-muted-foreground text-xs">
            这里的时间按俱乐部的默认时区（{CLUB_DEFAULT_TIMEZONE}
            ）显示；活动自己的时区见各活动的详情页。
          </p>
        </section>
      )}
    </div>
  );
}
