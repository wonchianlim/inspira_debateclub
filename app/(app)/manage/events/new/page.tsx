import Link from "next/link";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getScheduleOffsets } from "@/lib/admin/settings";
import { AREA_ROLES } from "@/lib/auth/roles";
import { requireAnyRole } from "@/lib/auth/session";
import { DEFAULT_SCHEDULE_OFFSETS, computeDefaultSchedule } from "@/lib/domain/event-schedule";
import { utcToZonedLocal, zonedTimeToUtc } from "@/lib/domain/timezone";

import { EventForm } from "../event-form";

export const metadata = { title: "New event · INSPIRA" };

export const dynamic = "force-dynamic";

/**
 * 新建活动的初值。
 *
 * 默认把活动排在"下一个整周的周六 18:00"——只是一个方便管理员少填几个字的初值，
 * 不是业务规则。其余时间点按系统设置里的偏移量推算。
 */
function buildDefaults(offsets: Parameters<typeof computeDefaultSchedule>[1]) {
  const zone = "Asia/Shanghai";
  const now = new Date();

  // 找一个未来至少 8 天的周六，保证默认的"提前 7 天开放报名"已经过去
  const target = new Date(now);
  target.setUTCDate(target.getUTCDate() + 8);
  while (target.getUTCDay() !== 6) target.setUTCDate(target.getUTCDate() + 1);

  const datePart = target.toISOString().slice(0, 10);
  const startsAtLocal = `${datePart}T18:00`;
  const startsAt = zonedTimeToUtc(startsAtLocal, zone);
  const schedule = computeDefaultSchedule(startsAt, offsets);

  return {
    title: "",
    timezone: zone,
    startsAtLocal,
    endsAtLocal: utcToZonedLocal(new Date(startsAt.getTime() + 3 * 60 * 60 * 1000), zone),
    registrationOpensAtLocal: utcToZonedLocal(schedule.registrationOpensAt, zone),
    registrationClosesAtLocal: utcToZonedLocal(schedule.registrationClosesAt, zone),
    checkInOpensAtLocal: utcToZonedLocal(schedule.checkInOpensAt, zone),
    warningAtLocal: utcToZonedLocal(schedule.warningAt, zone),
    meetingUrl: "",
    venue: "",
    notice: "",
  };
}

export default async function NewEventPage() {
  await requireAnyRole(AREA_ROLES.manage);

  const offsets = await getScheduleOffsets();
  const usingDefaults = JSON.stringify(offsets) === JSON.stringify(DEFAULT_SCHEDULE_OFFSETS);
  const defaults = buildDefaults(offsets);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-h2 font-semibold tracking-tight">New event</h1>
        <Button asChild variant="outline" size="sm">
          <Link href="/manage/events">Back to events</Link>
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Event information</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <p className="text-muted-foreground text-sm">
            A new event is created as a draft. Participants cannot see it until you move it to
            registration open.
          </p>
          {usingDefaults ? (
            <p className="text-muted-foreground text-xs" role="note">
              These are the <strong>system default</strong> offsets: registration opens 7 days
              before, closes 1 day before, check-in opens 30 minutes before. Change them in System
              Admin → Settings; no code change is needed.
            </p>
          ) : null}
          <EventForm mode="create" defaults={defaults} />
        </CardContent>
      </Card>
    </div>
  );
}
