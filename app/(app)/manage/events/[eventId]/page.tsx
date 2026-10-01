import Link from "next/link";
import { notFound } from "next/navigation";

import { StatusBadge } from "@/components/domain/status-badge";
import { describeEventLocation } from "@/lib/domain/event-location";
import { eventStatusTone } from "@/components/domain/status-tone";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getEventDetail } from "@/lib/admin/events";

import { MatchSettingsForm } from "./match-settings-form";
import { listAllFormats } from "@/lib/admin/formats";
import { AREA_ROLES } from "@/lib/auth/roles";
import { requireAnyRole } from "@/lib/auth/session";
import { EVENT_HAPPY_PATH, EVENT_STATUS_LABELS } from "@/lib/domain/event-lifecycle";
import { utcToZonedLocal } from "@/lib/domain/timezone";

import { CloneEventForm } from "./clone-form";
import { EventFormatsForm } from "./event-formats-form";
import { StatusTransitionForm } from "./status-transition-form";
import { EventForm } from "../event-form";

export const metadata = { title: "Event · INSPIRA" };

export const dynamic = "force-dynamic";

/** 界面上统一按活动时区显示时间，避免"服务器在上海、活动在别处"造成误解。 */
function formatZoned(iso: string, timezone: string): string {
  return utcToZonedLocal(new Date(iso), timezone).replace("T", " ");
}

export default async function EventDetailPage({
  params,
}: {
  params: Promise<{ eventId: string }>;
}) {
  await requireAnyRole(AREA_ROLES.manage);
  const { eventId } = await params;

  const [event, formats] = await Promise.all([getEventDetail(eventId), listAllFormats()]);
  if (!event) notFound();

  const enabledFormatIds = event.formats
    .filter((format) => format.enabled)
    .map((format) => format.formatId);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-semibold tracking-tight">{event.title}</h1>
        <div className="flex flex-wrap gap-2">
          <Button asChild size="sm">
            <Link href={`/manage/events/${event.id}/live`}>Live board</Link>
          </Button>
          <Button asChild variant="outline" size="sm">
            <Link href={`/manage/events/${event.id}/ballots`}>Ballots</Link>
          </Button>
          <Button asChild variant="outline" size="sm">
            <Link href={`/manage/events/${event.id}/matches`}>Rounds &amp; assignments</Link>
          </Button>
          <Button asChild variant="outline" size="sm">
            <Link href={`/manage/events/${event.id}/pairing`}>Teams &amp; pairings</Link>
          </Button>
          <Button asChild variant="outline" size="sm">
            <Link href={`/manage/events/${event.id}/registrations`}>Registrations</Link>
          </Button>
          <Button asChild variant="outline" size="sm">
            <Link href="/manage/events">Back to events</Link>
          </Button>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Current schedule</CardTitle>
        </CardHeader>
        <CardContent>
          <dl className="grid gap-3 text-sm sm:grid-cols-2">
            <div className="flex flex-col gap-0.5">
              <dt className="text-muted-foreground text-xs">Status</dt>
              <dd>
                <StatusBadge tone={eventStatusTone(event.status)}>
                  {EVENT_STATUS_LABELS[event.status] ?? event.status}
                </StatusBadge>
              </dd>
            </div>
            <div className="flex flex-col gap-0.5">
              <dt className="text-muted-foreground text-xs">Date / time zone</dt>
              <dd>
                {event.eventDate} · {event.timezone}
              </dd>
            </div>
            <div className="flex flex-col gap-0.5">
              <dt className="text-muted-foreground text-xs">Location</dt>
              <dd>{describeEventLocation(event).label}</dd>
            </div>
            <div className="flex flex-col gap-0.5">
              <dt className="text-muted-foreground text-xs">Registration opens</dt>
              <dd>{formatZoned(event.registrationOpensAt, event.timezone)}</dd>
            </div>
            <div className="flex flex-col gap-0.5">
              <dt className="text-muted-foreground text-xs">Registration closes</dt>
              <dd>{formatZoned(event.registrationClosesAt, event.timezone)}</dd>
            </div>
            <div className="flex flex-col gap-0.5">
              <dt className="text-muted-foreground text-xs">Check-in opens</dt>
              <dd>{formatZoned(event.checkInOpensAt, event.timezone)}</dd>
            </div>
            <div className="flex flex-col gap-0.5">
              <dt className="text-muted-foreground text-xs">Warning time</dt>
              <dd>{formatZoned(event.warningAt, event.timezone)}</dd>
            </div>
            <div className="flex flex-col gap-0.5">
              <dt className="text-muted-foreground text-xs">Starts</dt>
              <dd>{formatZoned(event.startsAt, event.timezone)}</dd>
            </div>
            <div className="flex flex-col gap-0.5">
              <dt className="text-muted-foreground text-xs">Ends</dt>
              <dd>{formatZoned(event.endsAt, event.timezone)}</dd>
            </div>
            {event.meetingUrl ? (
              <div className="flex flex-col gap-0.5 sm:col-span-2">
                <dt className="text-muted-foreground text-xs">Meeting link</dt>
                <dd className="break-all">{event.meetingUrl}</dd>
              </div>
            ) : null}
            {event.notice ? (
              <div className="flex flex-col gap-0.5 sm:col-span-2">
                <dt className="text-muted-foreground text-xs">Event notes</dt>
                <dd className="whitespace-pre-wrap">{event.notice}</dd>
              </div>
            ) : null}
          </dl>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Round settings</CardTitle>
        </CardHeader>
        <CardContent>
          <MatchSettingsForm
            eventId={event.id}
            timezone={event.timezone}
            matchStartAtLocal={toLocalInputValue(event.matchStartAt, event.timezone)}
            matchIntervalMinutes={event.matchIntervalMinutes}
            roomNames={event.roomNames}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Workflow</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <p className="text-muted-foreground text-sm">
            Full path: {EVENT_HAPPY_PATH.map((status) => EVENT_STATUS_LABELS[status]).join(" → ")}
          </p>

          {/*
            报名即将开放、但一个赛制都没启用时给出明确警告。
            这种情况不是"非法"（规范没有禁止），但学生报名时会没有赛制可选，
            属于几乎必然的配置遗漏，因此在最显眼的位置提示。
          */}
          {event.enabledFormatCount === 0 ? (
            <p
              role="alert"
              className="border-destructive/40 text-destructive rounded-md border px-3 py-2 text-sm"
            >
              No formats are enabled for this event. Tick at least one under Formats below before
              opening registration, or students will have nothing to register for.
            </p>
          ) : null}

          <StatusTransitionForm eventId={event.id} currentStatus={event.status} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Formats</CardTitle>
        </CardHeader>
        <CardContent>
          <EventFormatsForm
            eventId={event.id}
            formats={formats}
            enabledFormatIds={enabledFormatIds}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Edit event details</CardTitle>
        </CardHeader>
        <CardContent>
          <EventForm
            mode="edit"
            eventId={event.id}
            defaults={{
              title: event.title,
              timezone: event.timezone,
              startsAtLocal: utcToZonedLocal(new Date(event.startsAt), event.timezone),
              endsAtLocal: utcToZonedLocal(new Date(event.endsAt), event.timezone),
              registrationOpensAtLocal: utcToZonedLocal(
                new Date(event.registrationOpensAt),
                event.timezone,
              ),
              registrationClosesAtLocal: utcToZonedLocal(
                new Date(event.registrationClosesAt),
                event.timezone,
              ),
              checkInOpensAtLocal: utcToZonedLocal(new Date(event.checkInOpensAt), event.timezone),
              warningAtLocal: utcToZonedLocal(new Date(event.warningAt), event.timezone),
              meetingUrl: event.meetingUrl ?? "",
              venue: event.venue ?? "",
              notice: event.notice ?? "",
            }}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Duplicate event</CardTitle>
        </CardHeader>
        <CardContent>
          <CloneEventForm
            eventId={event.id}
            suggestedTitle={`${event.title} (copy)`}
            suggestedStartsAtLocal={utcToZonedLocal(
              new Date(new Date(event.startsAt).getTime() + 7 * 24 * 60 * 60 * 1000),
              event.timezone,
            )}
          />
        </CardContent>
      </Card>
    </div>
  );
}

/** 把 UTC 时间戳转成 `datetime-local` 输入框需要的本地格式。 */
function toLocalInputValue(value: string | null, timezone: string): string {
  if (!value) return "";
  return utcToZonedLocal(new Date(value), timezone).slice(0, 16);
}
