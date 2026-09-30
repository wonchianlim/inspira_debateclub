import "server-only";

import {
  MAX_DELIVERY_ATTEMPTS,
  type DeliveryRow,
  decideDelivery,
  onDeliveryFailed,
  onDeliverySucceeded,
  selectDueForDelivery,
} from "@/lib/domain/email-delivery";
import type { EmailTemplateKey } from "@/lib/domain/email-templates";
import { renderEmail } from "@/lib/domain/email-templates";
import { sendEmail } from "@/lib/email/send";
import { createServiceRoleSupabaseClient } from "@/lib/supabase/admin";

/**
 * 消费邮件队列（Phase 9 的 "email job processing"）。
 *
 * 这是 P9-2 里那一半"真的把信投出去"。队列、重试策略、模板都已经写好并有测试，
 * 这里只是把它们接起来。
 *
 * ⚠️ 用**服务角色**客户端：入队与投递都是系统行为，
 *    而且队列**没有给 authenticated 任何写权限**（P9-2 的决定）——
 *    给管理员写权限只会多一条绕开业务规则的路径。
 */

export type DispatchSummary = {
  considered: number;
  sent: number;
  failed: number;
  rescheduled: number;
  skipped: number;
};

function appUrl(): string {
  return process.env.NEXT_PUBLIC_APP_URL ?? "";
}

export async function dispatchEmailOutbox(limit = 25): Promise<DispatchSummary> {
  const supabase = createServiceRoleSupabaseClient();
  const now = new Date();

  const { data, error } = await supabase
    .from("email_outbox")
    .select("id, status, attempts, scheduled_at, to_email, template_key, payload")
    .in("status", ["pending", "sending"])
    .order("scheduled_at", { ascending: true })
    .limit(limit);

  if (error) throw new Error(`读取邮件队列失败：${error.message}`);

  const summary: DispatchSummary = {
    considered: 0,
    sent: 0,
    failed: 0,
    rescheduled: 0,
    skipped: 0,
  };

  type Row = {
    id: string;
    status: string;
    attempts: number;
    scheduled_at: string;
    to_email: string;
    template_key: string;
    payload: Record<string, unknown> | null;
  };

  const rows = (data ?? []) as unknown as Row[];

  /*
   * 先过一遍"现在该发哪些" —— 这一步是**纯函数**（`selectDueForDelivery`），
   * 因此"什么时候该重试"的规则有测试覆盖，不靠这里现场判断。
   */
  const due = selectDueForDelivery(
    rows.map((row): DeliveryRow => ({
      id: row.id,
      status: row.status as DeliveryRow["status"],
      attempts: row.attempts,
      scheduledAt: row.scheduled_at,
    })),
    now,
  );
  const dueIds = new Set(due.map((row) => row.id));
  summary.skipped = rows.length - dueIds.size;

  for (const row of rows) {
    summary.considered += 1;

    if (!dueIds.has(row.id)) {
      // 还没到时间、或已经到顶 —— 都不动它
      const decision = decideDelivery(
        {
          id: row.id,
          status: row.status as DeliveryRow["status"],
          attempts: row.attempts,
          scheduledAt: row.scheduled_at,
        },
        now,
      );
      if (decision.action === "give_up") {
        const result = onDeliveryFailed(
          Math.max(row.attempts, MAX_DELIVERY_ATTEMPTS - 1),
          decision.reason,
          now,
        );
        await supabase
          .from("email_outbox")
          .update({
            status: result.status,
            attempts: result.attempts,
            last_error: result.lastError,
          })
          .eq("id", row.id);
        summary.failed += 1;
      }
      continue;
    }

    // 渲染模板
    let rendered;
    try {
      rendered = renderEmail(row.template_key as EmailTemplateKey, {
        ...(row.payload ?? {}),
        appUrl: appUrl(),
      });
    } catch (renderError) {
      /*
       * 模板键不认识 —— **不能重试**，因为重试一百次还是不认识。
       * 直接标失败并把原因留下，让管理员能看到、能修。
       */
      const message = renderError instanceof Error ? renderError.message : String(renderError);
      await supabase
        .from("email_outbox")
        .update({
          status: "failed",
          attempts: row.attempts + 1,
          last_error: `模板渲染失败：${message}`,
        })
        .eq("id", row.id);
      summary.failed += 1;
      continue;
    }

    const result = await sendEmail({
      to: row.to_email,
      subject: rendered.subject,
      text: rendered.text,
      html: rendered.html,
    });

    if (result.ok) {
      const success = onDeliverySucceeded();
      await supabase
        .from("email_outbox")
        .update({ status: success.status, sent_at: success.sentAt, last_error: success.lastError })
        .eq("id", row.id);
      summary.sent += 1;
      continue;
    }

    // 失败：还能试就排下一次，到顶就标 failed（规则在纯函数里）
    const failure = onDeliveryFailed(row.attempts, result.error, now);
    await supabase
      .from("email_outbox")
      .update({
        status: failure.status,
        attempts: failure.attempts,
        last_error: failure.lastError,
        scheduled_at: failure.scheduledAt,
      })
      .eq("id", row.id);

    if (failure.status === "failed") summary.failed += 1;
    else summary.rescheduled += 1;
  }

  return summary;
}
