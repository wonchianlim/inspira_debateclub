import Link from "next/link";
import { notFound } from "next/navigation";

import { StatePanel } from "@/components/domain/state-panel";
import { MetaChip } from "@/components/domain/meta-chip";
import { StatusBadge } from "@/components/domain/status-badge";
import { liveStateTone } from "@/components/domain/status-tone";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getEventDetail } from "@/lib/admin/events";
import { LIVE_STATE_TEXT, getLiveDashboard } from "@/lib/admin/live";
import { AREA_ROLES } from "@/lib/auth/roles";
import { requireAnyRole } from "@/lib/auth/session";
import { liveStateUrgency } from "@/lib/domain/live-status";
import { CLUB_DEFAULT_TIMEZONE, utcToZonedLocal } from "@/lib/domain/timezone";

import { ManualCheckInButton } from "./live-controls";

export const metadata = { title: "Live board · INSPIRA" };

export const dynamic = "force-dynamic";

const URGENCY_LABELS = {
  "act-now": "Act now",
  attention: "Watch",
  none: "",
} as const;

export default async function LivePage({ params }: { params: Promise<{ eventId: string }> }) {
  await requireAnyRole(AREA_ROLES.manage);
  const { eventId } = await params;

  const [event, dashboard] = await Promise.all([
    getEventDetail(eventId),
    getLiveDashboard(eventId),
  ]);
  if (!event) notFound();

  if (!dashboard) {
    return (
      <StatePanel
        variant="error"
        title="Could not load the live board"
        description="Refresh the page and try again."
      />
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-h2 font-semibold tracking-tight">Live board · {event.title}</h1>
        <div className="flex flex-wrap gap-2">
          <Button asChild variant="outline" size="sm">
            <Link href={`/manage/events/${event.id}/matches`}>Rounds &amp; assignments</Link>
          </Button>
          <Button asChild variant="outline" size="sm">
            <Link href={`/manage/events/${event.id}`}>Back to event</Link>
          </Button>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            Check-in ({dashboard.registrationCounts.checkedIn} /{" "}
            {dashboard.registrationCounts.total}）
          </CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-2 text-sm">
          <p>
            {dashboard.checkInOpen
              ? "Check-in is open."
              : `Check-in opens 30 minutes before the event starts (start: ${utcToZonedLocal(new Date(dashboard.eventStartsAt), CLUB_DEFAULT_TIMEZONE).replace("T", " ")}).`}
          </p>
          <p className="text-muted-foreground text-xs">
            Warning time:
            {utcToZonedLocal(new Date(dashboard.warningAt), CLUB_DEFAULT_TIMEZONE).replace(
              "T",
              " ",
            )}
            Rounds still missing people after this time are flagged.
          </p>
        </CardContent>
      </Card>

      <dl className="grid gap-3 text-sm sm:grid-cols-4">
        {(
          [
            ["Rounds", dashboard.counts.total, ""],
            ["Ready", dashboard.counts.ready, ""],
            ["Missing people", dashboard.counts.warning, "Act now"],
            ["Overdue", dashboard.counts.overdue, "Act now"],
          ] as const
        ).map(([label, value, hint]) => (
          <div key={label} className="border-border rounded-md border px-3 py-2">
            <dt className="text-muted-foreground text-xs">{label}</dt>
            <dd className="text-lg">{value}</dd>
            {hint && value > 0 ? <dd className="text-destructive text-xs">{hint}</dd> : null}
          </div>
        ))}
      </dl>

      {dashboard.matches.length === 0 ? (
        <StatePanel
          variant="empty"
          title="No rounds yet"
          description="Generate rounds under Rounds & assignments first; the live board has nothing to show until then."
        />
      ) : (
        <div className="flex flex-col gap-4">
          {dashboard.matches.map((match) => {
            const urgency = liveStateUrgency(match.live.state);
            return (
              <Card
                key={match.matchId}
                className={urgency === "act-now" ? "border-destructive" : undefined}
              >
                <CardHeader>
                  <CardTitle className="flex flex-wrap items-center gap-2 text-base">
                    Round {match.matchNumber} · {match.roomName}
                    <MetaChip>{match.formatCode}</MetaChip>
                    <StatusBadge tone={liveStateTone(match.live.state)}>
                      {LIVE_STATE_TEXT[match.live.state]}
                    </StatusBadge>
                    {match.live.overdue ? <StatusBadge tone="danger">Overdue</StatusBadge> : null}
                    {match.ironman ? <MetaChip>Ironman</MetaChip> : null}
                  </CardTitle>
                </CardHeader>
                <CardContent className="flex flex-col gap-3 text-sm">
                  <p className="text-muted-foreground text-xs">
                    Scheduled start:
                    {utcToZonedLocal(new Date(match.scheduledStart), CLUB_DEFAULT_TIMEZONE).replace(
                      "T",
                      " ",
                    )}
                    {match.live.minutesUntilStart >= 0
                      ? `(${match.live.minutesUntilStart} minutes to go)`
                      : `(${Math.abs(match.live.minutesUntilStart)} minutes past)`}
                  </p>

                  <p>
                    Students checked in: {match.presentParticipants} / {match.requiredParticipants}
                    {match.missingStudents.length > 0 ? (
                      <span className="text-destructive">
                        {" "}
                        Not here yet: {match.missingStudents.map((s) => s.displayName).join(", ")}
                      </span>
                    ) : null}
                  </p>

                  <p>
                    Judges checked in: {match.presentJudges} / {match.requiredJudges}
                    {match.requiredJudges === 0 ? (
                      <span className="text-destructive"> No judge assigned</span>
                    ) : null}
                  </p>

                  {urgency !== "none" ? (
                    <p
                      className={
                        urgency === "act-now" ? "text-destructive" : "text-muted-foreground"
                      }
                    >
                      {URGENCY_LABELS[urgency]}
                      {match.live.missing.length > 0 ? `：${match.live.missing.join("、")}` : ""}
                    </p>
                  ) : null}

                  {match.missingStudents.length > 0 ? (
                    <div className="flex flex-col gap-2">
                      <p className="text-muted-foreground text-xs">
                        When a student arrives, you can check them in here on their behalf (recorded
                        as an admin check-in):
                      </p>
                      <div className="flex flex-wrap items-start gap-2">
                        {match.missingStudents.map((student) => (
                          <ManualCheckInButton
                            key={student.studentId}
                            eventId={event.id}
                            studentId={student.studentId}
                            studentName={student.displayName}
                          />
                        ))}
                      </div>
                    </div>
                  ) : null}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
