import Link from "next/link";
import { notFound } from "next/navigation";

import { StatePanel } from "@/components/domain/state-panel";
import { MetaChip } from "@/components/domain/meta-chip";
import { StatusBadge } from "@/components/domain/status-badge";
import { matchStatusTone } from "@/components/domain/status-tone";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getEventDetail } from "@/lib/admin/events";
import { listEventMatches } from "@/lib/admin/matches";
import { AREA_ROLES } from "@/lib/auth/roles";
import { requireAnyRole } from "@/lib/auth/session";
import { CLUB_DEFAULT_TIMEZONE, utcToZonedLocal } from "@/lib/domain/timezone";

import { GenerateMatchesForm, MatchStatusButtons } from "./match-controls";

export const metadata = { title: "比赛安排 · INSPIRA" };

export const dynamic = "force-dynamic";

const STATUS_LABELS: Record<string, string> = {
  scheduled: "已排定（未发布）",
  missing_participant: "缺少参赛者",
  ready: "可以开始",
  started: "已开始（名单已锁定）",
  ballot_submitted: "评分表已提交",
  published: "已发布",
  cancelled: "已取消",
};

export default async function MatchesPage({ params }: { params: Promise<{ eventId: string }> }) {
  await requireAnyRole(AREA_ROLES.manage);
  const { eventId } = await params;

  const [event, matches] = await Promise.all([getEventDetail(eventId), listEventMatches(eventId)]);
  if (!event) notFound();

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-semibold tracking-tight">比赛安排 · {event.title}</h1>
        <div className="flex flex-wrap gap-2">
          <Button asChild variant="outline" size="sm">
            <Link href={`/manage/events/${event.id}/pairing`}>配对提案</Link>
          </Button>
          <Button asChild variant="outline" size="sm">
            <Link href={`/manage/events/${event.id}`}>返回活动</Link>
          </Button>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">生成比赛</CardTitle>
        </CardHeader>
        <CardContent>
          <GenerateMatchesForm eventId={event.id} />
        </CardContent>
      </Card>

      {matches.length === 0 ? (
        <StatePanel
          variant="empty"
          title="还没有比赛"
          description="先在上一步生成并确认配对提案，再回到这里生成比赛。系统会把队伍按赛制分成一场一场，并尽量让评分相近、避免重复对手。"
        />
      ) : (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">比赛（{matches.length}）</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            {matches.map((match) => (
              <div key={match.matchId} className="border-border rounded-md border px-3 py-3">
                <div className="mb-2 flex flex-wrap items-center gap-2">
                  <strong className="text-sm">第 {match.matchNumber} 场</strong>
                  <MetaChip>{match.roomName}</MetaChip>
                  <span className="text-muted-foreground text-xs">
                    {utcToZonedLocal(new Date(match.scheduledStart), CLUB_DEFAULT_TIMEZONE).replace(
                      "T",
                      " ",
                    )}
                  </span>
                  <StatusBadge tone={matchStatusTone(match.status)}>
                    {STATUS_LABELS[match.status] ?? match.status}
                  </StatusBadge>
                  {match.ironman ? <MetaChip>铁人</MetaChip> : null}
                </div>

                <ul className="mb-2 flex flex-col gap-1 text-sm">
                  {match.teams.map((team) => (
                    <li key={team.teamId}>
                      <span className="font-mono text-xs">{team.position}</span>{" "}
                      {team.teamLabel ?? "（未编号队伍）"}
                    </li>
                  ))}
                </ul>

                <p className="text-muted-foreground mb-2 text-xs">
                  裁判：
                  {match.judges.length === 0
                    ? "尚未指派"
                    : match.judges
                        .map((judge) => `${judge.displayName}（${judge.role}）`)
                        .join("、")}
                </p>

                <MatchStatusButtons
                  matchId={match.matchId}
                  status={match.status}
                  rosterLocked={match.rosterLocked}
                />
              </div>
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
