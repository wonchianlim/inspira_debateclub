/**
 * 邮件模板（Phase 9 的 "templates"）。
 *
 * ⚠️ 纯函数：**不碰数据库、不碰网络**。因此可以穷举测试 ——
 * 这与项目里其他领域逻辑（配对、计分、状态机）同一套做法。
 *
 * ⚠️ 队列里存的是**模板键 + 数据**，不是渲染好的正文（P9-2 的决定）。
 * 因此改一次模板，队列里所有未发出的信都会用新文案。
 */

export type EmailTemplateKey = "ballot_published" | "ballot_overdue";

export type EmailPayload = Record<string, string | number | null | undefined>;

export type RenderedEmail = {
  subject: string;
  text: string;
  html: string;
};

/** 把数据里的值转成可显示的文本；缺失时用一句明确的话而不是空白。 */
function value(payload: EmailPayload, key: string, fallback = "（未提供）"): string {
  const raw = payload[key];
  if (raw === null || raw === undefined || raw === "") return fallback;
  return String(raw);
}

/** HTML 转义 —— 数据里有学生姓名、活动名，直接插进 HTML 会有注入问题。 */
function escapeHtml(input: string): string {
  return input
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function renderEmail(template: EmailTemplateKey, payload: EmailPayload): RenderedEmail {
  switch (template) {
    case "ballot_published": {
      const studentName = value(payload, "studentName", "同学");
      const eventTitle = value(payload, "eventTitle");
      const roundText = value(payload, "roundText", "");
      const appUrl = value(payload, "appUrl", "");

      const subject = `你的评分表已发布 · ${eventTitle}`;
      const bodyLines = [
        `${studentName} 你好，`,
        "",
        `你在「${eventTitle}」${roundText ? `（${roundText}）` : ""}的评分表已经由管理员发布。`,
        "现在可以登录系统查看你的分数、判决理由与反馈。",
        "",
        appUrl ? `查看：${appUrl}` : "",
        "",
        "—— INSPIRA 辩论社（系统自动发送，请勿回复）",
      ].filter((line) => line !== undefined);

      return {
        subject,
        text: bodyLines.join("\n"),
        html:
          `<p>${escapeHtml(studentName)} 你好，</p>` +
          `<p>你在「<strong>${escapeHtml(eventTitle)}</strong>」` +
          `${roundText ? `（${escapeHtml(roundText)}）` : ""}的评分表已经由管理员发布。</p>` +
          `<p>现在可以登录系统查看你的分数、判决理由与反馈。</p>` +
          (appUrl ? `<p><a href="${escapeHtml(appUrl)}">查看评分表</a></p>` : "") +
          `<p style="color:#888;font-size:12px">—— INSPIRA 辩论社（系统自动发送，请勿回复）</p>`,
      };
    }

    case "ballot_overdue": {
      const judgeName = value(payload, "judgeName", "裁判");
      const eventTitle = value(payload, "eventTitle");
      const matchText = value(payload, "matchText");
      const minutesOverdue = value(payload, "minutesOverdue", "—");
      const appUrl = value(payload, "appUrl", "");

      return {
        subject: `提醒：第 ${matchText} 场的评分表还没提交`,
        text: [
          `${judgeName} 你好，`,
          "",
          `「${eventTitle}」${matchText}的评分表，距比赛开始已超过约 ${minutesOverdue} 分钟仍未提交。`,
          "请尽快登录系统完成评分表。",
          "",
          appUrl ? `填表：${appUrl}` : "",
          "",
          "—— INSPIRA 辩论社（系统自动发送，请勿回复）",
        ].join("\n"),
        html:
          `<p>${escapeHtml(judgeName)} 你好，</p>` +
          `<p>「<strong>${escapeHtml(eventTitle)}</strong>」${escapeHtml(matchText)}的评分表，` +
          `距比赛开始已超过约 <strong>${escapeHtml(minutesOverdue)}</strong> 分钟仍未提交。</p>` +
          `<p>请尽快登录系统完成评分表。</p>` +
          (appUrl ? `<p><a href="${escapeHtml(appUrl)}">填写评分表</a></p>` : "") +
          `<p style="color:#888;font-size:12px">—— INSPIRA 辩论社（系统自动发送，请勿回复）</p>`,
      };
    }

    default: {
      // 未知模板键不能静默发出一个空邮件 —— 那会让收件人莫名其妙
      const exhaustive: never = template;
      throw new Error(`未知的邮件模板键：${String(exhaustive)}`);
    }
  }
}
