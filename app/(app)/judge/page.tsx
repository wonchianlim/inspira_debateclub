import Link from "next/link";

import { MetaChip } from "@/components/domain/meta-chip";
import { StatePanel } from "@/components/domain/state-panel";
import { StatusBadge } from "@/components/domain/status-badge";
import { ballotStatusTone } from "@/components/domain/status-tone";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { AREA_ROLES } from "@/lib/auth/roles";
import { requireAnyRole } from "@/lib/auth/session";
import { listMyAssignedMatches } from "@/lib/judge/ballots";
import { CLUB_DEFAULT_TIMEZONE, utcToZonedLocal } from "@/lib/domain/timezone";
import { BALLOT_STATUS_LABELS } from "@/lib/validation/ballot-submission";

export const metadata = { title: "裁判区域 · INSPIRA" };

export const dynamic = "force-dynamic";

export default async function JudgeAreaPage() {
  await requireAnyRole(AREA_ROLES.judge);
  const matches = await listMyAssignedMatches();

  const pending = matches.filter(
    (match) =>
      match.ballotStatus === null ||
      match.ballotStatus === "draft" ||
      match.ballotStatus === "reopened",
  );

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-semibold tracking-tight">裁判区域</h1>
        <Button asChild variant="outline" size="sm">
          <Link href="/judge/profile">我的档案与理念</Link>
        </Button>
      </div>

      {matches.length === 0 ? (
        <StatePanel
          variant="empty"
          title="目前没有指派给你的比赛"
          description="管理员指派之后，你会在这里看到要评分的比赛。"
        />
      ) : (
        <>
          <p className="text-muted-foreground text-sm">
            你被指派了 {matches.length} 场比赛，其中 {pending.length} 场还没提交评分表。
          </p>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">我负责的比赛</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-3">
              {matches.map((match) => (
                <div
                  key={match.matchId}
                  className="border-border flex flex-wrap items-center justify-between gap-3 rounded-md border px-3 py-3"
                >
                  <div className="flex flex-col gap-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <strong className="text-sm">
                        第 {match.matchNumber} 场 · {match.roomName}
                      </strong>
                      <MetaChip>{match.formatCode}</MetaChip>
                      {/*
                        还没开始填的情况是 Neutral（规范 §13.4：Not started），
                        不是错误也不是成功。
                      */}
                      <StatusBadge
                        tone={match.ballotStatus ? ballotStatusTone(match.ballotStatus) : "neutral"}
                      >
                        {match.ballotStatus
                          ? (BALLOT_STATUS_LABELS[match.ballotStatus] ?? match.ballotStatus)
                          : "尚未开始填写"}
                      </StatusBadge>
                    </div>
                    <span className="text-muted-foreground text-xs">
                      {utcToZonedLocal(
                        new Date(match.scheduledStart),
                        CLUB_DEFAULT_TIMEZONE,
                      ).replace("T", " ")}
                    </span>
                  </div>

                  {/*
                    没有模板时**不给"填表"按钮**，而是说明原因。
                    让裁判点进一个空白页再发现"打不了分"，是更差的体验。
                  */}
                  {match.hasTemplate ? (
                    <Button asChild size="sm">
                      <Link href={`/judge/matches/${match.matchId}`}>
                        {match.ballotStatus === "submitted" || match.ballotStatus === "published"
                          ? "查看评分表"
                          : "填写评分表"}
                      </Link>
                    </Button>
                  ) : (
                    <span className="text-destructive text-xs">
                      这个赛制还没有配置评分表模板，请联系管理员
                    </span>
                  )}
                </div>
              ))}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
