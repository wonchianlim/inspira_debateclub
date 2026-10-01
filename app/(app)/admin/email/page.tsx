import Link from "next/link";

import { MetaChip } from "@/components/domain/meta-chip";
import { StatePanel } from "@/components/domain/state-panel";
import { StatusBadge } from "@/components/domain/status-badge";
import { emailDeliveryTone } from "@/components/domain/status-tone";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getEmailOutbox } from "@/lib/admin/email-outbox";
import { requireAnyRole } from "@/lib/auth/session";
import { CLUB_DEFAULT_TIMEZONE, utcToZonedLocal } from "@/lib/domain/timezone";

export const metadata = { title: "邮件队列 · INSPIRA" };
export const dynamic = "force-dynamic";

const STATUS_LABELS: Record<string, string> = {
  pending: "等待发送",
  sending: "发送中",
  sent: "已发送",
  failed: "发送失败",
  cancelled: "已取消",
};

function format(iso: string | null): string {
  if (!iso) return "—";
  return utcToZonedLocal(new Date(iso), CLUB_DEFAULT_TIMEZONE).replace("T", " ");
}

export default async function AdminEmailPage() {
  await requireAnyRole(["club_manager", "super_admin"]);
  const outbox = await getEmailOutbox();

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-semibold tracking-tight">邮件队列</h1>
        <Button asChild variant="outline" size="sm">
          <Link href="/admin">返回管理</Link>
        </Button>
      </div>

      {/*
        ⚠️ 这个提示**必须存在**，而且要显眼。
        服务商还没选定，队列只积累、不投递 ——
        不写清楚的话，产品负责人会以为通知已经发给学生了。
        将来接上服务商时，只需让 deliveryConfigured 返回 true，这里自动变。
      */}
      {!outbox.deliveryConfigured ? (
        <Card className="border-destructive">
          <CardHeader>
            <CardTitle className="text-destructive text-base">
              邮件尚未真正发出 —— 这里只是「准备发出」的清单
            </CardTitle>
          </CardHeader>
          <CardContent className="text-sm">
            <p>
              还没有选定邮件服务商，因此系统**只记录「这封信该发」**，
              并没有真的投递。你看到的是**待发清单**，学生的邮箱里**不会有任何东西**。
            </p>
            <p className="text-muted-foreground mt-2 text-xs">
              选定服务商之后，只需要加一个「消费这个队列」的作业，本页会自动改成正常显示。
            </p>
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">队列概况（共 {outbox.rows.length} 条）</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-x-8 gap-y-2 text-sm">
          <span>
            等待发送
            <strong className="ml-1">{outbox.pending}</strong>
          </span>
          <span>
            已发送
            <strong className="ml-1">{outbox.sent}</strong>
          </span>
          {outbox.failed > 0 ? (
            <span className="text-destructive">
              发送失败
              <strong className="ml-1">{outbox.failed}</strong>
            </span>
          ) : null}
        </CardContent>
      </Card>

      {outbox.rows.length === 0 ? (
        <StatePanel
          variant="empty"
          title="队列是空的"
          description="系统认为有信要发时（例如评分表发布、超时提醒），会在这里出现一条记录。"
        />
      ) : (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">全部记录</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-2 text-sm">
            <p className="text-muted-foreground text-xs">
              收件人地址**部分遮蔽** —— 够认出是谁，又不把几十个学生的邮箱全部摊开。
            </p>
            {outbox.rows.map((row) => (
              <div
                key={row.id}
                className="border-border flex flex-col gap-1 rounded-md border px-3 py-2"
              >
                <div className="flex flex-wrap items-center gap-2">
                  <strong className="font-mono text-xs">{row.toEmail}</strong>
                  <MetaChip>{row.templateKey}</MetaChip>
                  <StatusBadge tone={emailDeliveryTone(row.status)}>
                    {STATUS_LABELS[row.status] ?? row.status}
                  </StatusBadge>
                  {row.attempts > 0 ? (
                    <span className="text-muted-foreground text-xs">已尝试 {row.attempts} 次</span>
                  ) : null}
                </div>
                <span className="text-muted-foreground text-xs">
                  计划发送 {format(row.scheduledAt)}
                  {row.sentAt ? ` · 实际发送 ${format(row.sentAt)}` : ""}
                </span>
                {/*
                  失败原因一定要显示 —— 藏起来的话管理员只看到"失败"，
                  却无从知道为什么，也就没法处理。
                */}
                {row.lastError ? (
                  <span className="text-destructive text-xs">失败原因：{row.lastError}</span>
                ) : null}
              </div>
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
