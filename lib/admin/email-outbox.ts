import "server-only";

import { createUserSupabaseClient } from "@/lib/supabase/server";

/**
 * 邮件队列的读取层（Phase 9 / P9-2b）。
 *
 * ⚠️ 界面必须写明"**邮件尚未真正发出**" —— 服务商还没选定，
 *    队列目前只积累、不投递。不写清楚的话，产品负责人会以为通知已经发给学生了。
 */

export type OutboxRow = {
  id: string;
  toEmail: string;
  templateKey: string;
  status: string;
  attempts: number;
  lastError: string | null;
  scheduledAt: string;
  sentAt: string | null;
  createdAt: string;
};

export type OutboxSummary = {
  rows: OutboxRow[];
  pending: number;
  sent: number;
  failed: number;
  /** 是否已经接上邮件服务商 */
  deliveryConfigured: boolean;
};

/**
 * 队列内容。
 *
 * `deliveryConfigured` 目前**恒为 false**：没有任何消费队列的作业存在。
 * 这里返回它而不是让界面硬编码，是为了将来接上服务商时
 * **只需改这一处**，界面自动跟着变 —— 而不是留下一个说着"尚未发出"
 * 却其实早就发出去了的提示（那种错误比没有提示更糟）。
 */
export async function getEmailOutbox(limit = 100): Promise<OutboxSummary> {
  const supabase = await createUserSupabaseClient();

  const { data, error } = await supabase
    .from("email_outbox")
    .select(
      "id, to_email, template_key, status, attempts, last_error, scheduled_at, sent_at, created_at",
    )
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) throw new Error(`读取邮件队列失败：${error.message}`);

  const rows: OutboxRow[] = (data ?? []).map((row) => ({
    id: row.id as string,
    /*
     * ⚠️ 邮箱地址在界面上**部分遮蔽**。
     * 管理员需要判断"发给了谁"，但完整地址没有必要全部摊开 ——
     * 队列里可能有几十上百条别人的邮箱。
     */
    toEmail: maskEmail(row.to_email as string),
    templateKey: row.template_key as string,
    status: row.status as string,
    attempts: row.attempts as number,
    lastError: row.last_error as string | null,
    scheduledAt: row.scheduled_at as string,
    sentAt: row.sent_at as string | null,
    createdAt: row.created_at as string,
  }));

  return {
    rows,
    pending: rows.filter((row) => row.status === "pending").length,
    sent: rows.filter((row) => row.status === "sent").length,
    failed: rows.filter((row) => row.status === "failed").length,
    deliveryConfigured: false,
  };
}

/** `zhangsan@qq.com` → `zh***@qq.com`。够管理员认出是谁，又不把地址摊开。 */
function maskEmail(email: string): string {
  const at = email.indexOf("@");
  if (at <= 0) return "***";
  const name = email.slice(0, at);
  const domain = email.slice(at);
  const visible = name.slice(0, Math.min(2, name.length));
  return `${visible}***${domain}`;
}
