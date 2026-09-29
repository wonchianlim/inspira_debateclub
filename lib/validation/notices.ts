import { z } from "zod";

import { APP_ROLES, type AppRole } from "@/lib/auth/roles";
import { CLUB_DEFAULT_TIMEZONE, isValidTimeZone, zonedTimeToUtc } from "@/lib/domain/timezone";

/**
 * 通知的输入校验（主规格第 6.3 节）。
 *
 * 数据库对"受众类型与目标列必须匹配"有 CHECK 约束（P2-1），
 * 这里做同样的事情并给出**中文提示** —— 两者必须一致。
 */

export const NOTICE_AUDIENCES = ["global", "event", "role", "format"] as const;
export type NoticeAudience = (typeof NOTICE_AUDIENCES)[number];

export const NOTICE_AUDIENCE_LABELS: Record<NoticeAudience, string> = {
  global: "全体",
  event: "某个活动",
  role: "某个角色",
  format: "某个赛制",
};

export const NOTICE_AUDIENCE_DESCRIPTIONS: Record<NoticeAudience, string> = {
  global: "所有已登录用户都能看到。",
  event: "只有该活动的报名学生能看到（已取消报名的不算）。",
  role: "拥有该角色的用户能看到。",
  format: "对该赛制有档案的人能看到：学生看资格/评分档案，裁判看已获资格的赛制。",
};

export const PUBLISH_MODES = ["draft", "now", "scheduled"] as const;
export type PublishMode = (typeof PUBLISH_MODES)[number];

const LOCAL_DATE_TIME_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/;

const optionalLocalDateTime = z
  .string()
  .trim()
  .refine((value) => value === "" || LOCAL_DATE_TIME_PATTERN.test(value), {
    error: "请填写完整日期与时间",
  })
  .optional();

export const noticeInputSchema = z
  .object({
    title: z.string().trim().min(1, { error: "请填写通知标题" }).max(200, { error: "最多 200 字" }),
    body: z
      .string()
      .trim()
      .min(1, { error: "请填写通知内容" })
      .max(5000, { error: "最多 5000 字" }),
    audienceType: z.enum(NOTICE_AUDIENCES, { error: "请选择接收对象" }),
    eventId: z.string().trim().optional(),
    role: z.string().trim().optional(),
    formatId: z.string().trim().optional(),
    publishMode: z.enum(PUBLISH_MODES, { error: "请选择发布方式" }),
    publishedAtLocal: optionalLocalDateTime,
    expiresAtLocal: optionalLocalDateTime,
    timezone: z
      .string()
      .trim()
      .refine(isValidTimeZone, { error: "无法识别的时区" })
      .default(CLUB_DEFAULT_TIMEZONE),
  })
  .superRefine((value, ctx) => {
    const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

    // 逐类检查"该填的填了、不该填的没填"，与数据库 CHECK 约束一一对应
    const targeting: Record<NoticeAudience, { ok: boolean; message: string; field: string }> = {
      global: {
        ok: !value.eventId && !value.role && !value.formatId,
        message: "接收对象是「全体」时，不需要选择活动、角色或赛制。",
        field: "audienceType",
      },
      event: {
        ok: Boolean(value.eventId && uuidPattern.test(value.eventId)),
        message: "请选择要通知的活动。",
        field: "eventId",
      },
      role: {
        ok: Boolean(value.role && (APP_ROLES as readonly string[]).includes(value.role)),
        message: "请选择要通知的角色。",
        field: "role",
      },
      format: {
        ok: Boolean(value.formatId && uuidPattern.test(value.formatId)),
        message: "请选择要通知的赛制。",
        field: "formatId",
      },
    };

    const check = targeting[value.audienceType];
    if (!check.ok) {
      ctx.addIssue({ code: "custom", path: [check.field], message: check.message });
    }

    // 定时发布必须填时间；立即发布与草稿不需要
    if (value.publishMode === "scheduled") {
      if (!value.publishedAtLocal || !LOCAL_DATE_TIME_PATTERN.test(value.publishedAtLocal)) {
        ctx.addIssue({
          code: "custom",
          path: ["publishedAtLocal"],
          message: "选择「定时发布」时必须填写发布时间。",
        });
      }
    }

    // 过期时间必须晚于发布时间（数据库有同样的 CHECK）
    if (
      value.publishedAtLocal &&
      LOCAL_DATE_TIME_PATTERN.test(value.publishedAtLocal) &&
      value.expiresAtLocal &&
      LOCAL_DATE_TIME_PATTERN.test(value.expiresAtLocal) &&
      isValidTimeZone(value.timezone)
    ) {
      const published = zonedTimeToUtc(value.publishedAtLocal, value.timezone);
      const expires = zonedTimeToUtc(value.expiresAtLocal, value.timezone);
      if (expires <= published) {
        ctx.addIssue({
          code: "custom",
          path: ["expiresAtLocal"],
          message: "过期时间必须晚于发布时间。",
        });
      }
    }
  });

export type NoticeInput = z.infer<typeof noticeInputSchema>;

/**
 * 把输入换算成数据库字段。
 *
 * `publishMode` 的三种情况：
 *   draft     → published_at = NULL（只有管理员能看到）
 *   now       → published_at = 当前时刻
 *   scheduled → published_at = 按俱乐部时区换算出的时刻
 */
export function toNoticeRecord(input: NoticeInput) {
  let publishedAt: string | null = null;
  if (input.publishMode === "now") {
    publishedAt = new Date().toISOString();
  } else if (input.publishMode === "scheduled" && input.publishedAtLocal) {
    publishedAt = zonedTimeToUtc(input.publishedAtLocal, input.timezone).toISOString();
  }

  const expiresAt =
    input.expiresAtLocal && LOCAL_DATE_TIME_PATTERN.test(input.expiresAtLocal)
      ? zonedTimeToUtc(input.expiresAtLocal, input.timezone).toISOString()
      : null;

  return {
    title: input.title,
    body: input.body,
    audience_type: input.audienceType,
    // 只保留与受众类型匹配的那一列，其余强制为 NULL（数据库 CHECK 会验证）
    // `?? null` 是必要的：可选字段可能是 undefined，而数据库列是 NULL
    event_id: input.audienceType === "event" ? (input.eventId ?? null) : null,
    // 数据库的 role 列是 app_role 枚举，不是任意字符串；
    // 上面的 superRefine 已经确认过它属于 APP_ROLES，这里是把结论告诉类型系统
    role: input.audienceType === "role" ? ((input.role ?? null) as AppRole | null) : null,
    format_id: input.audienceType === "format" ? (input.formatId ?? null) : null,
    published_at: publishedAt,
    expires_at: expiresAt,
  };
}

export const noticeIdSchema = z.guid({ error: "通知标识格式不正确" });
