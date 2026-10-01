import Link from "next/link";

import { StatePanel } from "@/components/domain/state-panel";
import { StatusBadge } from "@/components/domain/status-badge";
import { noticeStatusTone } from "@/components/domain/status-tone";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { listNotices, noticeStatusOf } from "@/lib/admin/notices";
import { ROLE_LABELS, type AppRole } from "@/lib/auth/roles";
import { utcToZonedLocal } from "@/lib/domain/timezone";
import { CLUB_DEFAULT_TIMEZONE } from "@/lib/domain/timezone";
import { NOTICE_AUDIENCE_LABELS } from "@/lib/validation/notices";

export const metadata = { title: "Announcements · INSPIRA" };

export const dynamic = "force-dynamic";

const STATUS_LABELS = {
  draft: "Draft",
  scheduled: "Scheduled",
  published: "Published",
  expired: "Expired",
} as const;

export default async function ManageNoticesPage() {
  const notices = await listNotices();

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-h2 font-semibold tracking-tight">Announcements</h1>
        <div className="flex gap-2">
          <Button asChild variant="outline" size="sm">
            <Link href="/manage">Back to Club Admin</Link>
          </Button>
          <Button asChild size="sm">
            <Link href="/manage/notices/new">New announcement</Link>
          </Button>
        </div>
      </div>

      <p className="text-muted-foreground text-sm">
        Notices appear inside the system only, to signed-in users. For email delivery, see System
        Admin → Email Queue.
      </p>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{notices.length} announcements</CardTitle>
        </CardHeader>
        <CardContent>
          {notices.length === 0 ? (
            <StatePanel
              variant="empty"
              title="No announcements yet"
              description="Use New announcement to write the first one. You can save a draft and publish after checking it."
            />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <caption className="sr-only">
                  Announcement list: title, audience, status and publish time
                </caption>
                <thead>
                  <tr className="border-border border-b text-left">
                    <th scope="col" className="py-2 pr-4 font-medium">
                      Title
                    </th>
                    <th scope="col" className="py-2 pr-4 font-medium">
                      Audience
                    </th>
                    <th scope="col" className="py-2 pr-4 font-medium">
                      Status
                    </th>
                    <th scope="col" className="py-2 pr-4 font-medium">
                      Published at
                    </th>
                    <th scope="col" className="py-2 font-medium">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {notices.map((notice) => {
                    const status = noticeStatusOf(notice);
                    const target =
                      notice.audienceType === "event"
                        ? (notice.eventTitle ?? "(event deleted)")
                        : notice.audienceType === "role" && notice.role
                          ? (ROLE_LABELS[notice.role as AppRole] ?? notice.role)
                          : notice.audienceType === "format"
                            ? (notice.formatCode ?? "(unknown format)")
                            : "";
                    return (
                      <tr key={notice.id} className="border-border border-b last:border-0">
                        <td className="py-3 pr-4">{notice.title}</td>
                        <td className="py-3 pr-4">
                          {NOTICE_AUDIENCE_LABELS[notice.audienceType] ?? notice.audienceType}
                          {target ? (
                            <span className="text-muted-foreground"> · {target}</span>
                          ) : null}
                        </td>
                        <td className="py-3 pr-4">
                          <StatusBadge tone={noticeStatusTone(status)}>
                            {STATUS_LABELS[status]}
                          </StatusBadge>
                        </td>
                        <td className="py-3 pr-4">
                          {notice.publishedAt
                            ? utcToZonedLocal(
                                new Date(notice.publishedAt),
                                CLUB_DEFAULT_TIMEZONE,
                              ).replace("T", " ")
                            : "—"}
                        </td>
                        <td className="py-3">
                          <Link
                            href={`/manage/notices/${notice.id}`}
                            className="focus-visible:ring-ring/50 rounded underline focus-visible:ring-3"
                          >
                            Manage
                          </Link>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
