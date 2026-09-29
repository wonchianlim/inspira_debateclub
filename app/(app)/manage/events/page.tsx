import Link from "next/link";

import { StatePanel } from "@/components/domain/state-panel";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { listEvents } from "@/lib/admin/events";
import {
  EVENT_STATUSES,
  EVENT_STATUS_LABELS,
  type EventStatus,
} from "@/lib/domain/event-lifecycle";
import { utcToZonedLocal } from "@/lib/domain/timezone";

export const metadata = { title: "活动管理 · INSPIRA" };

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
        <h1 className="text-xl font-semibold tracking-tight">活动管理</h1>
        <div className="flex gap-2">
          <Button asChild variant="outline" size="sm">
            <Link href="/manage">返回俱乐部管理</Link>
          </Button>
          <Button asChild size="sm">
            <Link href="/manage/events/new">新建活动</Link>
          </Button>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">按状态筛选</CardTitle>
        </CardHeader>
        <CardContent>
          {/*
            状态筛选用链接而不是下拉表单：状态只有几种，点一下就能切换，
            比"选完再点筛选"少一步；地址栏同样能看到当前条件。
          */}
          <nav aria-label="按状态筛选活动" className="flex flex-wrap gap-2">
            <Link
              href="/manage/events"
              aria-current={status === undefined ? "true" : undefined}
              className={`focus-visible:ring-ring/50 rounded-md border px-3 py-1.5 text-sm focus-visible:ring-3 ${
                status === undefined ? "bg-muted font-medium" : "text-muted-foreground"
              }`}
            >
              全部
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
            共 {events.length} 个活动
            {events.length === 200 ? "（已达上限 200）" : ""}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {events.length === 0 ? (
            <StatePanel
              variant="empty"
              title="还没有活动"
              description="点右上角「新建活动」创建第一个活动。创建后可以设置启用哪些赛制。"
              action={
                <Button asChild size="sm">
                  <Link href="/manage/events/new">新建活动</Link>
                </Button>
              }
            />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <caption className="sr-only">
                  活动列表，包含名称、状态、开始时间与启用的赛制数量
                </caption>
                <thead>
                  <tr className="border-border border-b text-left">
                    <th scope="col" className="py-2 pr-4 font-medium">
                      活动名称
                    </th>
                    <th scope="col" className="py-2 pr-4 font-medium">
                      状态
                    </th>
                    <th scope="col" className="py-2 pr-4 font-medium">
                      开始时间（活动时区）
                    </th>
                    <th scope="col" className="py-2 pr-4 font-medium">
                      启用赛制
                    </th>
                    <th scope="col" className="py-2 font-medium">
                      操作
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {events.map((event) => (
                    <tr key={event.id} className="border-border border-b last:border-0">
                      <td className="py-3 pr-4">{event.title}</td>
                      <td className="py-3 pr-4">
                        <Badge variant={event.status === "draft" ? "outline" : "secondary"}>
                          {EVENT_STATUS_LABELS[event.status] ?? event.status}
                        </Badge>
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
                      <td className="py-3 pr-4">{event.enabledFormatCount} 个</td>
                      <td className="py-3">
                        <Link
                          href={`/manage/events/${event.id}`}
                          className="focus-visible:ring-ring/50 rounded underline focus-visible:ring-3"
                        >
                          管理
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
