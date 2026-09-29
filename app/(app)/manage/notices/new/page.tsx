import Link from "next/link";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { listEvents } from "@/lib/admin/events";
import { listAllFormats } from "@/lib/admin/formats";
import { AREA_ROLES } from "@/lib/auth/roles";
import { requireAnyRole } from "@/lib/auth/session";
import { CLUB_DEFAULT_TIMEZONE } from "@/lib/domain/timezone";

import { NoticeForm } from "../notice-form";

export const metadata = { title: "新建通知 · INSPIRA" };

export const dynamic = "force-dynamic";

export default async function NewNoticePage() {
  await requireAnyRole(AREA_ROLES.manage);
  const [events, formats] = await Promise.all([listEvents(), listAllFormats()]);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-semibold tracking-tight">新建通知</h1>
        <Button asChild variant="outline" size="sm">
          <Link href="/manage/notices">返回通知列表</Link>
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">通知内容</CardTitle>
        </CardHeader>
        <CardContent>
          <NoticeForm
            mode="create"
            defaults={{
              title: "",
              body: "",
              audienceType: "global",
              eventId: "",
              role: "",
              formatId: "",
              publishMode: "draft",
              publishedAtLocal: "",
              expiresAtLocal: "",
              timezone: CLUB_DEFAULT_TIMEZONE,
            }}
            eventOptions={events.map((event) => ({ id: event.id, title: event.title }))}
            formatOptions={formats.map((format) => ({
              id: format.id,
              code: format.code,
              name: format.name,
            }))}
          />
        </CardContent>
      </Card>
    </div>
  );
}
