import Link from "next/link";
import { notFound } from "next/navigation";

import { StatePanel } from "@/components/domain/state-panel";
import { StatusBadge } from "@/components/domain/status-badge";
import { registrationStatusTone } from "@/components/domain/status-tone";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getEventDetail } from "@/lib/admin/events";
import { listEventRegistrations, registrationIssueLabel } from "@/lib/admin/registrations";
import { AREA_ROLES } from "@/lib/auth/roles";
import { requireAnyRole } from "@/lib/auth/session";
import { CLUB_DEFAULT_TIMEZONE, utcToZonedLocal } from "@/lib/domain/timezone";
import { REGISTRATION_STATUS_LABELS } from "@/lib/validation/registrations";

import { AddRegistrationForm, RegistrationStatusForm } from "./registration-forms";

export const metadata = { title: "报名管理 · INSPIRA" };

export const dynamic = "force-dynamic";

export default async function EventRegistrationsPage({
  params,
}: {
  params: Promise<{ eventId: string }>;
}) {
  await requireAnyRole(AREA_ROLES.manage);
  const { eventId } = await params;

  const [event, registrations] = await Promise.all([
    getEventDetail(eventId),
    listEventRegistrations(eventId),
  ]);
  if (!event) notFound();

  const active = registrations.filter(
    (row) => row.status === "registered" || row.status === "checked_in",
  );
  const withIssues = active.filter((row) => row.issues.length > 0);
  const cancelled = registrations.filter(
    (row) => row.status === "cancelled" || row.status === "late_cancelled",
  );
  const noShow = registrations.filter((row) => row.status === "no_show");

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-semibold tracking-tight">报名管理 · {event.title}</h1>
        <Button asChild variant="outline" size="sm">
          <Link href={`/manage/events/${event.id}`}>返回活动</Link>
        </Button>
      </div>

      <dl className="grid gap-3 text-sm sm:grid-cols-4">
        <div className="border-border rounded-md border px-3 py-2">
          <dt className="text-muted-foreground text-xs">有效报名</dt>
          <dd className="text-lg">{active.length}</dd>
        </div>
        <div className="border-border rounded-md border px-3 py-2">
          <dt className="text-muted-foreground text-xs">需要处理</dt>
          <dd className="text-lg">{withIssues.length}</dd>
        </div>
        <div className="border-border rounded-md border px-3 py-2">
          <dt className="text-muted-foreground text-xs">已取消</dt>
          <dd className="text-lg">{cancelled.length}</dd>
        </div>
        <div className="border-border rounded-md border px-3 py-2">
          <dt className="text-muted-foreground text-xs">未到场</dt>
          <dd className="text-lg">{noShow.length}</dd>
        </div>
      </dl>

      {/*
        规范第 9.2 节第 7 条要求"配对前复核未解决的资格与偏好"。
        这里把"谁还需要处理"单独列出来 —— 管理员不需要自己在几百行里找。
      */}
      {withIssues.length > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-destructive text-base">
              配对前需要处理（{withIssues.length} 人）
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="flex flex-col gap-1 text-sm">
              {withIssues.map((row) => (
                <li key={row.registrationId}>
                  {row.studentName}
                  {row.school ? (
                    <span className="text-muted-foreground"> · {row.school}</span>
                  ) : null}
                  <span className="text-destructive">
                    {" "}
                    —— {row.issues.map(registrationIssueLabel).join("、")}
                  </span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">人工补报名</CardTitle>
        </CardHeader>
        <CardContent>
          <AddRegistrationForm eventId={event.id} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">全部报名（{registrations.length}）</CardTitle>
        </CardHeader>
        <CardContent>
          {registrations.length === 0 ? (
            <StatePanel
              variant="empty"
              title="还没有人报名"
              description="报名开放后，学生自助报名的人会出现在这里。也可以在上面按搭档码人工补报名。"
            />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <caption className="sr-only">报名列表，包含学生、状态、偏好与需处理的问题</caption>
                <thead>
                  <tr className="border-border border-b text-left">
                    <th scope="col" className="py-2 pr-4 font-medium">
                      学生
                    </th>
                    <th scope="col" className="py-2 pr-4 font-medium">
                      状态
                    </th>
                    <th scope="col" className="py-2 pr-4 font-medium">
                      赛制偏好
                    </th>
                    <th scope="col" className="py-2 pr-4 font-medium">
                      可参加赛制
                    </th>
                    <th scope="col" className="py-2 pr-4 font-medium">
                      报名时间
                    </th>
                    <th scope="col" className="py-2 font-medium">
                      修改状态
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {registrations.map((row) => (
                    <tr key={row.registrationId} className="border-border border-b last:border-0">
                      <td className="py-3 pr-4">
                        <div className="flex flex-col">
                          <span>{row.studentName}</span>
                          {row.school ? (
                            <span className="text-muted-foreground text-xs">{row.school}</span>
                          ) : null}
                        </div>
                      </td>
                      <td className="py-3 pr-4">
                        <div className="flex flex-col gap-1">
                          <StatusBadge tone={registrationStatusTone(row.status)}>
                            {REGISTRATION_STATUS_LABELS[row.status] ?? row.status}
                          </StatusBadge>
                          {row.issues.length > 0 ? (
                            <span className="text-destructive text-xs">
                              {row.issues.map(registrationIssueLabel).join("、")}
                            </span>
                          ) : null}
                        </div>
                      </td>
                      <td className="py-3 pr-4">{row.preferenceCount} 个</td>
                      <td className="py-3 pr-4">{row.eligibleFormatCount} 个</td>
                      <td className="text-muted-foreground py-3 pr-4 text-xs">
                        {utcToZonedLocal(new Date(row.registeredAt), CLUB_DEFAULT_TIMEZONE).replace(
                          "T",
                          " ",
                        )}
                      </td>
                      <td className="py-3">
                        <RegistrationStatusForm
                          registrationId={row.registrationId}
                          currentStatus={row.status}
                        />
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
