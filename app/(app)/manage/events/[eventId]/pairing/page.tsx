import Link from "next/link";
import { notFound } from "next/navigation";

import { StatePanel } from "@/components/domain/state-panel";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getEventDetail } from "@/lib/admin/events";
import { getPairingOverview } from "@/lib/admin/pairing-reads";
import { AREA_ROLES } from "@/lib/auth/roles";
import { requireAnyRole } from "@/lib/auth/session";
import { warningCategory } from "@/lib/domain/pairing-warnings";
import { CLUB_DEFAULT_TIMEZONE, utcToZonedLocal } from "@/lib/domain/timezone";
import { PAIRING_PROPOSAL_STATUS_LABELS, WARNING_IS_INFORMATIONAL } from "@/lib/validation/pairing";

import {
  ConfirmProposalButton,
  DissolveTeamButton,
  GenerateForm,
  TeamLockButton,
} from "./pairing-controls";

export const metadata = { title: "配对提案 · INSPIRA" };

export const dynamic = "force-dynamic";

export default async function PairingPage({ params }: { params: Promise<{ eventId: string }> }) {
  await requireAnyRole(AREA_ROLES.manage);
  const { eventId } = await params;

  const [event, overview] = await Promise.all([
    getEventDetail(eventId),
    getPairingOverview(eventId),
  ]);
  if (!event) notFound();

  const needsAttention =
    overview?.warnings.filter((w) => warningCategory(w.code) === "需要处理") ?? [];
  const informational =
    overview?.warnings.filter((w) => warningCategory(w.code) === "仅供参考") ?? [];

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-semibold tracking-tight">配对提案 · {event.title}</h1>
        <div className="flex flex-wrap gap-2">
          <Button asChild variant="outline" size="sm">
            <Link href={`/manage/events/${event.id}/registrations`}>报名管理</Link>
          </Button>
          <Button asChild variant="outline" size="sm">
            <Link href={`/manage/events/${event.id}`}>返回活动</Link>
          </Button>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">生成</CardTitle>
        </CardHeader>
        <CardContent>
          <GenerateForm eventId={event.id} />
        </CardContent>
      </Card>

      {!overview ? (
        <StatePanel
          variant="empty"
          title="还没有生成过配对提案"
          description="点上面的「生成配对提案」开始。系统会按学生的赛制偏好与评分分配队伍，并把取舍的理由列出来。"
        />
      ) : (
        <>
          {/*
            警告放在页面**最上方**、队伍列表之前，而不是折叠或放在页脚。
            规范要求"每个不明显的分配都要说明取舍"；如果管理员看不到这些说明，
            规范那条要求就等于没实现。
          */}
          {needsAttention.length > 0 ? (
            <Card className="border-destructive">
              <CardHeader>
                <CardTitle className="text-destructive text-base">
                  需要你处理（{needsAttention.length} 条）
                </CardTitle>
              </CardHeader>
              <CardContent>
                <ul className="flex flex-col gap-2 text-sm">
                  {needsAttention.map((warning, index) => (
                    <li key={`${warning.code}-${index}`}>
                      {warning.formatCode ? (
                        <Badge variant="outline" className="mr-2 font-normal">
                          {warning.formatCode}
                        </Badge>
                      ) : null}
                      {warning.message}
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          ) : null}

          <Card>
            <CardHeader>
              <CardTitle className="flex flex-wrap items-center gap-2 text-base">
                提案信息
                <Badge variant="outline" className="font-normal">
                  {PAIRING_PROPOSAL_STATUS_LABELS[overview.status]}
                </Badge>
              </CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-3">
              <dl className="grid gap-3 text-sm sm:grid-cols-4">
                <div>
                  <dt className="text-muted-foreground text-xs">生成时间</dt>
                  <dd>
                    {utcToZonedLocal(new Date(overview.generatedAt), CLUB_DEFAULT_TIMEZONE).replace(
                      "T",
                      " ",
                    )}
                  </dd>
                </div>
                <div>
                  <dt className="text-muted-foreground text-xs">队伍数</dt>
                  <dd>{overview.teams.length}</dd>
                </div>
                <div>
                  <dt className="text-muted-foreground text-xs">未被分配</dt>
                  <dd>{overview.unallocatedNames.length}</dd>
                </div>
                <div>
                  <dt className="text-muted-foreground text-xs">算法版本</dt>
                  <dd className="font-mono text-xs">{overview.algorithmVersion}</dd>
                </div>
              </dl>

              {overview.status !== "confirmed" ? (
                <ConfirmProposalButton proposalId={overview.proposalId} />
              ) : null}
            </CardContent>
          </Card>

          {overview.unallocatedNames.length > 0 ? (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">
                  没有分到队伍的同学（{overview.unallocatedNames.length}）
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-muted-foreground mb-2 text-sm">
                  这些同学已报名，但系统没能给他们安排辩论。常见原因：没有填写赛制偏好、
                  没有赛制资格，或愿意去同一赛制的人数不足以凑齐一支队伍。
                </p>
                <ul className="flex flex-col gap-1 text-sm">
                  {overview.unallocatedNames.map((student) => (
                    <li key={student.studentId}>{student.displayName}</li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          ) : null}

          <Card>
            <CardHeader>
              <CardTitle className="text-base">队伍（{overview.teams.length}）</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-4">
              {overview.teams.map((team) => (
                <div key={team.teamId} className="border-border rounded-md border px-3 py-3">
                  <div className="mb-2 flex flex-wrap items-center gap-2">
                    <strong className="text-sm">{team.teamLabel ?? "（未编号）"}</strong>
                    <Badge variant="outline" className="font-normal">
                      {team.formatCode}
                    </Badge>
                    {team.averageRating !== null ? (
                      <span className="text-muted-foreground text-xs">
                        平均评分 {team.averageRating}
                      </span>
                    ) : null}
                    {team.locked ? (
                      <Badge variant="secondary" className="font-normal">
                        已锁定
                      </Badge>
                    ) : null}
                    {team.manuallyEdited && !team.locked ? (
                      <Badge variant="outline" className="font-normal">
                        人工调整过
                      </Badge>
                    ) : null}
                  </div>

                  <ul className="mb-3 flex flex-col gap-1 text-sm">
                    {team.members.map((member) => (
                      <li key={member.studentId}>
                        {member.displayName}
                        {member.school ? (
                          <span className="text-muted-foreground"> · {member.school}</span>
                        ) : null}
                        <span className="text-muted-foreground"> · 评分 {member.rating}</span>
                      </li>
                    ))}
                  </ul>

                  <div className="flex flex-wrap items-start gap-2">
                    <TeamLockButton teamId={team.teamId} locked={team.locked} />
                    <DissolveTeamButton teamId={team.teamId} />
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>

          {informational.length > 0 ? (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">其他提示（{informational.length} 条）</CardTitle>
              </CardHeader>
              <CardContent className="flex flex-col gap-2">
                <p className="text-muted-foreground text-xs">{WARNING_IS_INFORMATIONAL}</p>
                <ul className="text-muted-foreground flex flex-col gap-1 text-sm">
                  {informational.map((warning, index) => (
                    <li key={`${warning.code}-${index}`}>
                      {warning.formatCode ? `[${warning.formatCode}] ` : ""}
                      {warning.message}
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          ) : null}
        </>
      )}
    </div>
  );
}
