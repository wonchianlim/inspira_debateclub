import Link from "next/link";

import { StatePanel } from "@/components/domain/state-panel";
import { StatusBadge } from "@/components/domain/status-badge";
import { eventStatusTone } from "@/components/domain/status-tone";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { listEvents } from "@/lib/admin/events";
import {
  EVENT_STATUSES,
  EVENT_STATUS_LABELS,
  type EventStatus,
} from "@/lib/domain/event-lifecycle";
import { utcToZonedLocal } from "@/lib/domain/timezone";

export const metadata = { title: "Events · INSPIRA" };

export const dynamic = "force-dynamic";

function parseStatus(value?: string): EventStatus | undefined {
  return EVENT_STATUSES.includes(value as EventStatus) ? (value as EventStatus) : undefined;
}

export default async function ManageEventsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  const params = await searchParams;
  const status = parseStatus(params.status);
  const events = await listEvents({ status });

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-h2 font-semibold tracking-tight">Events</h1>
        <div className="flex gap-2">
          <Button asChild variant="outline" size="sm">
            <Link href="/manage">Back to Club Admin</Link>
          </Button>
          <Button asChild size="sm">
            <Link href="/manage/events/new">Create event</Link>
          </Button>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Filter by status</CardTitle>
        </CardHeader>
        <CardContent>
          {/*
            状态筛选用链接而不是下拉表单：状态只有几种，点一下就能切换，
            比"选完再点筛选"少一步；地址栏同样能看到当前条件。
          */}
          <nav aria-label="Filter events by status" className="flex flex-wrap gap-2">
            <Link
              href="/manage/events"
              aria-current={status === undefined ? "true" : undefined}
              className={`focus-visible:ring-ring/50 rounded-md border px-3 py-1.5 text-sm focus-visible:ring-3 ${
                status === undefined ? "bg-muted font-medium" : "text-muted-foreground"
              }`}
            >
              All
            </Link>
            {EVENT_STATUSES.map((value) => (
              <Link
                key={value}
                href={`/manage/events?status=${value}`}
                aria-current={status === value ? "true" : undefined}
                className={`focus-visible:ring-ring/50 rounded-md border px-3 py-1.5 text-sm focus-visible:ring-3 ${
                  status === value ? "bg-muted font-medium" : "text-muted-foreground"
                }`}
              >
                {EVENT_STATUS_LABELS[value]}
              </Link>
            ))}
          </nav>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            {events.length} {events.length === 1 ? "event" : "events"}
            {events.length === 200 ? " (200 is the limit)" : ""}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {events.length === 0 ? (
            <StatePanel
              variant="empty"
              title="No events yet"
              description="Use Create event to add the first one. After that you can choose which formats it runs."
              action={
                <Button asChild size="sm">
                  <Link href="/manage/events/new">Create event</Link>
                </Button>
              }
            />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <caption className="sr-only">
                  Event list: name, status, start time and number of formats enabled
                </caption>
                <thead>
                  <tr className="border-border border-b text-left">
                    <th scope="col" className="py-2 pr-4 font-medium">
                      Event
                    </th>
                    <th scope="col" className="py-2 pr-4 font-medium">
                      Status
                    </th>
                    <th scope="col" className="py-2 pr-4 font-medium">
                      Starts (event time zone)
                    </th>
                    <th scope="col" className="py-2 pr-4 font-medium">
                      Formats
                    </th>
                    <th scope="col" className="py-2 font-medium">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {events.map((event) => (
                    <tr key={event.id} className="border-border border-b last:border-0">
                      <td className="py-3 pr-4">{event.title}</td>
                      <td className="py-3 pr-4">
                        <StatusBadge tone={eventStatusTone(event.status)}>
                          {EVENT_STATUS_LABELS[event.status] ?? event.status}
                        </StatusBadge>
                      </td>
                      <td className="py-3 pr-4">
                        {/*
                          按**活动时区**显示，而不是服务器时区。
                          管理员看到的时间必须和参与者看到的一致。
                        */}
                        <span className="block">
                          {utcToZonedLocal(new Date(event.startsAt), event.timezone).replace(
                            "T",
                            " ",
                          )}
                        </span>
                        <span className="text-muted-foreground text-xs">
                          {event.eventDate} · {event.timezone}
                        </span>
                      </td>
                      <td className="py-3 pr-4">{event.enabledFormatCount}</td>
                      <td className="py-3">
                        <Link
                          href={`/manage/events/${event.id}`}
                          className="focus-visible:ring-ring/50 rounded underline focus-visible:ring-3"
                        >
                          Manage
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
