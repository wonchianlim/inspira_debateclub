import { StatePanel } from "@/components/domain/state-panel";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { listVisibleNotices } from "@/lib/admin/notices";
import { requireSession } from "@/lib/auth/session";
import { CLUB_DEFAULT_TIMEZONE, utcToZonedLocal } from "@/lib/domain/timezone";
import { NOTICE_AUDIENCE_LABELS } from "@/lib/validation/notices";

export const metadata = { title: "通知 · INSPIRA" };

export const dynamic = "force-dynamic";

/**
 * 通知中心。
 *
 * ⚠️ **没有任何受众过滤代码** —— 能读到哪些通知完全由数据库策略
 *    `notices_select_audience` 决定。这是本项目的一贯做法：
 *    数据库负责"能不能看到"，应用只负责"怎么显示"。
 *    若在这里再写一份受众判断，两边迟早不一致，而且应用层的那份不算安全措施。
 */
export default async function NotificationsPage() {
  await requireSession();
  const notices = await listVisibleNotices();

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-xl font-semibold tracking-tight">通知</h1>

      {notices.length === 0 ? (
        <StatePanel
          variant="empty"
          title="目前没有新通知"
          description="有面向你的通知时会出现在这里（例如面向全体、你的角色、你报名的活动或你的赛制）。"
        />
      ) : (
        <div className="flex flex-col gap-4">
          {notices.map((notice) => (
            <Card key={notice.id}>
              <CardHeader>
                <CardTitle className="flex flex-wrap items-center gap-2 text-base">
                  {notice.title}
                  <Badge variant="outline" className="font-normal">
                    {NOTICE_AUDIENCE_LABELS[notice.audienceType] ?? notice.audienceType}
                  </Badge>
                </CardTitle>
              </CardHeader>
              <CardContent className="flex flex-col gap-2">
                <p className="text-sm whitespace-pre-wrap">{notice.body}</p>
                <p className="text-muted-foreground text-xs">
                  {utcToZonedLocal(new Date(notice.publishedAt), CLUB_DEFAULT_TIMEZONE).replace(
                    "T",
                    " ",
                  )}
                  （{CLUB_DEFAULT_TIMEZONE}）
                </p>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
