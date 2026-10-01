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

export const metadata = { title: "Registrations · INSPIRA" };

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
        <h1 className="text-h2 font-semibold tracking-tight">Registrations · {event.title}</h1>
        <Button asChild variant="outline" size="sm">
          <Link href={`/manage/events/${event.id}`}>Back to event</Link>
        </Button>
      </div>

      <dl className="grid gap-3 text-sm sm:grid-cols-4">
        <div className="border-border rounded-md border px-3 py-2">
          <dt className="text-muted-foreground text-xs">Active registrations</dt>
          <dd className="text-lg">{active.length}</dd>
        </div>
        <div className="border-border rounded-md border px-3 py-2">
          <dt className="text-muted-foreground text-xs">Needs attention</dt>
          <dd className="text-lg">{withIssues.length}</dd>
        </div>
        <div className="border-border rounded-md border px-3 py-2">
          <dt className="text-muted-foreground text-xs">Cancelled</dt>
          <dd className="text-lg">{cancelled.length}</dd>
        </div>
        <div className="border-border rounded-md border px-3 py-2">
          <dt className="text-muted-foreground text-xs">No show</dt>
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
              Needs attention before pairing ({withIssues.length})
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
          <CardTitle className="text-base">Add a registration manually</CardTitle>
        </CardHeader>
        <CardContent>
          <AddRegistrationForm eventId={event.id} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">All registrations ({registrations.length})</CardTitle>
        </CardHeader>
        <CardContent>
          {registrations.length === 0 ? (
            <StatePanel
              variant="empty"
              title="No registrations yet"
              description="Once registration is open, students who register appear here. You can also add one above using a partner code."
            />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <caption className="sr-only">
                  Registration list: student, status, format preferences and issues to resolve
                </caption>
                <thead>
                  <tr className="border-border border-b text-left">
                    <th scope="col" className="py-2 pr-4 font-medium">
                      Student
                    </th>
                    <th scope="col" className="py-2 pr-4 font-medium">
                      Status
                    </th>
                    <th scope="col" className="py-2 pr-4 font-medium">
                      Format preferences
                    </th>
                    <th scope="col" className="py-2 pr-4 font-medium">
                      Eligible formats
                    </th>
                    <th scope="col" className="py-2 pr-4 font-medium">
                      Registered at
                    </th>
                    <th scope="col" className="py-2 font-medium">
                      Change status
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
                      <td className="py-3 pr-4">{row.preferenceCount}</td>
                      <td className="py-3 pr-4">{row.eligibleFormatCount}</td>
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
