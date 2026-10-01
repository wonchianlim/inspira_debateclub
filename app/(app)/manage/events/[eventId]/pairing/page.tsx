import Link from "next/link";
import { notFound } from "next/navigation";

import { StatePanel } from "@/components/domain/state-panel";
import { MetaChip } from "@/components/domain/meta-chip";
import { StatusBadge } from "@/components/domain/status-badge";
import { pairingProposalTone } from "@/components/domain/status-tone";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getEventDetail } from "@/lib/admin/events";
import { getPairingOverview, getParticipationIdsByStudent } from "@/lib/admin/pairing-reads";
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
import { MoveMemberForm } from "./move-member-form";

export const metadata = { title: "Teams & pairings · INSPIRA" };

export const dynamic = "force-dynamic";

export default async function PairingPage({ params }: { params: Promise<{ eventId: string }> }) {
  await requireAnyRole(AREA_ROLES.manage);
  const { eventId } = await params;

  const [event, overview, memberParticipationIds] = await Promise.all([
    getEventDetail(eventId),
    getPairingOverview(eventId),
    // 移动队员需要 participation_id，而界面上的成员是以学生 id 呈现的
    getParticipationIdsByStudent(eventId),
  ]);
  if (!event) notFound();

  const needsAttention =
    overview?.warnings.filter((w) => warningCategory(w.code) === "action") ?? [];
  const informational = overview?.warnings.filter((w) => warningCategory(w.code) === "info") ?? [];

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-h2 font-semibold tracking-tight">
          Teams &amp; pairings · {event.title}
        </h1>
        <div className="flex flex-wrap gap-2">
          <Button asChild variant="outline" size="sm">
            <Link href={`/manage/events/${event.id}/registrations`}>Registrations</Link>
          </Button>
          <Button asChild variant="outline" size="sm">
            <Link href={`/manage/events/${event.id}`}>Back to event</Link>
          </Button>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Generate</CardTitle>
        </CardHeader>
        <CardContent>
          <GenerateForm eventId={event.id} />
        </CardContent>
      </Card>

      {!overview ? (
        <StatePanel
          variant="empty"
          title="No pairing proposal yet"
          description="Use Generate pairings above to start. Teams are built from each student's format preferences and rating, and the trade-offs are listed for you."
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
                  Needs your attention ({needsAttention.length})
                </CardTitle>
              </CardHeader>
              <CardContent>
                <ul className="flex flex-col gap-2 text-sm">
                  {needsAttention.map((warning, index) => (
                    <li key={`${warning.code}-${index}`}>
                      {warning.formatCode ? (
                        <MetaChip className="mr-2">{warning.formatCode}</MetaChip>
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
                Proposal details
                <StatusBadge tone={pairingProposalTone(overview.status)}>
                  {PAIRING_PROPOSAL_STATUS_LABELS[overview.status]}
                </StatusBadge>
              </CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-3">
              <dl className="grid gap-3 text-sm sm:grid-cols-4">
                <div>
                  <dt className="text-muted-foreground text-xs">Generated at</dt>
                  <dd>
                    {utcToZonedLocal(new Date(overview.generatedAt), CLUB_DEFAULT_TIMEZONE).replace(
                      "T",
                      " ",
                    )}
                  </dd>
                </div>
                <div>
                  <dt className="text-muted-foreground text-xs">Teams</dt>
                  <dd>{overview.teams.length}</dd>
                </div>
                <div>
                  <dt className="text-muted-foreground text-xs">Unallocated</dt>
                  <dd>{overview.unallocatedNames.length}</dd>
                </div>
                <div>
                  <dt className="text-muted-foreground text-xs">Algorithm version</dt>
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
                  Students without a team ({overview.unallocatedNames.length})
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-muted-foreground mb-2 text-sm">
                  These students registered but could not be placed. Usual causes: no format
                  preferences, no eligible format, or too few people choosing the same format to
                  fill a team.
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
              <CardTitle className="text-base">Teams ({overview.teams.length})</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-4">
              {overview.teams.map((team) => (
                <div key={team.teamId} className="border-border rounded-md border px-3 py-3">
                  <div className="mb-2 flex flex-wrap items-center gap-2">
                    <strong className="text-sm">{team.teamLabel ?? "(unnumbered)"}</strong>
                    <MetaChip>{team.formatCode}</MetaChip>
                    {team.averageRating !== null ? (
                      <span className="text-muted-foreground text-xs">
                        Average rating {team.averageRating}
                      </span>
                    ) : null}
                    {/* "已锁定"是状态：名单已冻结，不能再改。 */}
                    {team.locked ? <StatusBadge>Locked</StatusBadge> : null}
                    {/* "人工调整过"是来源说明，不是状态。 */}
                    {team.manuallyEdited && !team.locked ? (
                      <MetaChip>Edited by hand</MetaChip>
                    ) : null}
                  </div>

                  <ul className="mb-3 flex flex-col gap-1 text-sm">
                    {team.members.map((member) => {
                      const participationId = memberParticipationIds.get(member.studentId);
                      return (
                        <li key={member.studentId} className="flex flex-wrap items-center gap-2">
                          <span>
                            {member.displayName}
                            {member.school ? (
                              <span className="text-muted-foreground"> · {member.school}</span>
                            ) : null}
                            <span className="text-muted-foreground"> · rating {member.rating}</span>
                          </span>
                          {participationId && !team.locked ? (
                            <MoveMemberForm
                              fromTeamId={team.teamId}
                              participationId={participationId}
                              studentName={member.displayName}
                              otherTeams={overview.teams
                                .filter(
                                  (other) =>
                                    other.teamId !== team.teamId &&
                                    other.formatId === team.formatId,
                                )
                                .map((other) => ({
                                  teamId: other.teamId,
                                  label: other.teamLabel ?? "(unnumbered team)",
                                }))}
                            />
                          ) : null}
                        </li>
                      );
                    })}
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
                <CardTitle className="text-base">Other notes ({informational.length})</CardTitle>
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
