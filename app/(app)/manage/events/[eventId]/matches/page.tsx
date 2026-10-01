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

export const metadata = { title: "Rounds & assignments · INSPIRA" };

export const dynamic = "force-dynamic";

const STATUS_LABELS: Record<string, string> = {
  scheduled: "Scheduled (not published)",
  missing_participant: "Missing participants",
  ready: "Ready to start",
  started: "Started (roster locked)",
  ballot_submitted: "Ballot submitted",
  published: "Published",
  cancelled: "Cancelled",
};

export default async function MatchesPage({ params }: { params: Promise<{ eventId: string }> }) {
  await requireAnyRole(AREA_ROLES.manage);
  const { eventId } = await params;

  const [event, matches] = await Promise.all([getEventDetail(eventId), listEventMatches(eventId)]);
  if (!event) notFound();

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-h2 font-semibold tracking-tight">
          Rounds &amp; assignments · {event.title}
        </h1>
        <div className="flex flex-wrap gap-2">
          <Button asChild variant="outline" size="sm">
            <Link href={`/manage/events/${event.id}/pairing`}>Teams &amp; pairings</Link>
          </Button>
          <Button asChild variant="outline" size="sm">
            <Link href={`/manage/events/${event.id}`}>Back to event</Link>
          </Button>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Generate rounds</CardTitle>
        </CardHeader>
        <CardContent>
          <GenerateMatchesForm eventId={event.id} />
        </CardContent>
      </Card>

      {matches.length === 0 ? (
        <StatePanel
          variant="empty"
          title="No rounds yet"
          description="Generate and confirm the pairing proposal first, then come back here. Teams are split into rounds by format, keeping ratings close and avoiding repeat matchups."
        />
      ) : (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Rounds ({matches.length})</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            {matches.map((match) => (
              <div key={match.matchId} className="border-border rounded-md border px-3 py-3">
                <div className="mb-2 flex flex-wrap items-center gap-2">
                  <strong className="text-sm">Round {match.matchNumber}</strong>
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
                  {match.ironman ? <MetaChip>Ironman</MetaChip> : null}
                </div>

                <ul className="mb-2 flex flex-col gap-1 text-sm">
                  {match.teams.map((team) => (
                    <li key={team.teamId}>
                      <span className="font-mono text-xs">{team.position}</span>{" "}
                      {team.teamLabel ?? "(unnumbered team)"}
                    </li>
                  ))}
                </ul>

                <p className="text-muted-foreground mb-2 text-xs">
                  Judges:
                  {match.judges.length === 0
                    ? "Not assigned yet"
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
