import "server-only";

/**
 * 通过 Resend 发一封信（Phase 9 的 "email job processing"）。
 *
 * ⚠️ 这个模块**只负责投递**。要不要发、发给谁、发什么内容，
 * 都由队列（`email_outbox`）与模板决定 —— 那条分界线是 P9-2 划的，
 * 正是为了让"换服务商不用改业务代码"成立。
 *
 * -----------------------------------------------------------------------------
 * ⚠️ 服务商被隔离在这一个文件里
 *
 * 换服务商时**只改这个文件**。这是刻意的：本项目已经因为"选哪家邮件服务商"
 * 反复过好几轮（腾讯云 / 企业微信邮箱 / Resend），
 * 而每一次反复都不应该碰到模板、队列或业务逻辑。
 */

/** 发信地址。用子域名 —— 主域名上已有腾讯企业邮箱的 SPF，不能动。 */
export const EMAIL_FROM = "INSPIRA 辩论社 <noreply@mail.inspira.education>";

/** 发一封信的结果。 */
export type SendResult = { ok: true; providerId: string } | { ok: false; error: string };

export type OutgoingEmail = {
  to: string;
  subject: string;
  text: string;
  html: string;
  /** 可选：回复地址 */
  replyTo?: string;
};

export async function sendEmail(message: OutgoingEmail): Promise<SendResult> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    // 配置缺失要说清楚，而不是让请求带着空密钥去打服务商
    return { ok: false, error: "没有配置 RESEND_API_KEY" };
  }

  try {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: EMAIL_FROM,
        to: [message.to],
        subject: message.subject,
        text: message.text,
        html: message.html,
        ...(message.replyTo ? { reply_to: message.replyTo } : {}),
      }),
    });

    const payload = (await response.json().catch(() => ({}))) as {
      id?: string;
      message?: string;
      name?: string;
    };

    if (!response.ok) {
      /*
       * 服务商的错误原文要留下来 —— 它会被写进 `last_error` 并显示在队列页面上。
       * 换成"发送失败"会让管理员完全不知道该怎么办。
       */
      return {
        ok: false,
        error: `${response.status} ${payload.name ?? ""} ${payload.message ?? ""}`.trim(),
      };
    }
    if (!payload.id) {
      return { ok: false, error: "服务商返回成功但没有邮件编号" };
    }
    return { ok: true, providerId: payload.id };
  } catch (error) {
    // 网络异常也要变成一句能存进 last_error 的话
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  }
}
