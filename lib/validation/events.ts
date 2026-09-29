import { z } from "zod";

import { isValidTimeZone, zonedDateOf, zonedTimeToUtc } from "@/lib/domain/timezone";

/**
 * 活动的输入校验。
 *
 * 两层分工：
 *   - **本文件**：格式校验 + 跨字段关系校验，给出**中文提示**；
 *   - **数据库**：CHECK 约束与触发器，是真正的保证。
 * 两者必须一致 —— 这里写的规则就是数据库里那几条，只是换成了人话。
 */

/** 形如 `2026-10-15T18:00` 的本地时间（不带时区，时区由活动本身决定）。 */
const LOCAL_DATE_TIME_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/;

const localDateTime = z
  .string()
  .trim()
  .regex(LOCAL_DATE_TIME_PATTERN, { error: "请填写完整日期与时间" });

const timezone = z.string().trim().refine(isValidTimeZone, { error: "无法识别的时区" });

const title = z
  .string()
  .trim()
  .min(1, { error: "请填写活动名称" })
  .max(120, { error: "最多 120 字" });

const optionalUrl = z
  .string()
  .trim()
  .max(500)
  .refine((value) => value === "" || /^https?:\/\/\S+$/.test(value), {
    error: "请填写以 http:// 或 https:// 开头的完整网址",
  })
  .optional();

const optionalText = z.string().trim().max(2000, { error: "最多 2000 字" }).optional();

export const eventInputSchema = z
  .object({
    title,
    timezone,
    startsAtLocal: localDateTime,
    endsAtLocal: localDateTime,
    registrationOpensAtLocal: localDateTime,
    registrationClosesAtLocal: localDateTime,
    checkInOpensAtLocal: localDateTime,
    warningAtLocal: localDateTime,
    meetingUrl: optionalUrl,
    notice: optionalText,
  })
  .superRefine((value, ctx) => {
    /*
     * ⚠️ 必须先确认所有时间字段的**格式**都正确，再往下换算。
     *
     * `superRefine` 即使前面的字段级校验失败也会执行，而 `zonedTimeToUtc`
     * 遇到格式不对的输入会**抛异常**。若不提前返回，用户提交一个空时间
     * 就会得到 500，而不是"请填写完整日期与时间"。
     * （这是实测发现的：单元测试传入空字符串时直接抛错。）
     */
    const timeFields = [
      value.startsAtLocal,
      value.endsAtLocal,
      value.registrationOpensAtLocal,
      value.registrationClosesAtLocal,
      value.checkInOpensAtLocal,
      value.warningAtLocal,
    ];
    if (!timeFields.every((field) => LOCAL_DATE_TIME_PATTERN.test(field))) return;

    // 时区本身必须是合法的，否则下面的换算同样会抛错
    if (!isValidTimeZone(value.timezone)) return;

    const starts = zonedTimeToUtc(value.startsAtLocal, value.timezone);
    const ends = zonedTimeToUtc(value.endsAtLocal, value.timezone);
    const opens = zonedTimeToUtc(value.registrationOpensAtLocal, value.timezone);
    const closes = zonedTimeToUtc(value.registrationClosesAtLocal, value.timezone);
    const checkIn = zonedTimeToUtc(value.checkInOpensAtLocal, value.timezone);
    const warning = zonedTimeToUtc(value.warningAtLocal, value.timezone);

    // 逐条对应数据库的 CHECK 约束与触发器，顺序按"先解决哪个最自然"排列
    if (opens >= closes) {
      ctx.addIssue({
        code: "custom",
        path: ["registrationClosesAtLocal"],
        message: "报名截止必须晚于报名开放。",
      });
    }
    if (closes > starts) {
      ctx.addIssue({
        code: "custom",
        path: ["registrationClosesAtLocal"],
        message: "报名截止不能晚于活动开始。",
      });
    }
    if (checkIn > starts) {
      ctx.addIssue({
        code: "custom",
        path: ["checkInOpensAtLocal"],
        message: "签到开放不能晚于活动开始。",
      });
    }
    if (warning > starts) {
      ctx.addIssue({
        code: "custom",
        path: ["warningAtLocal"],
        message: "警示时间不能晚于活动开始。",
      });
    }
    if (starts >= ends) {
      ctx.addIssue({
        code: "custom",
        path: ["endsAtLocal"],
        message: "结束时间必须晚于开始时间。",
      });
    }
  });

export type EventInput = z.infer<typeof eventInputSchema>;

/** 数据库行里与时间有关的字段（全部是 UTC ISO 字符串）。 */
export type EventScheduleRecord = {
  event_date: string;
  timezone: string;
  registration_opens_at: string;
  registration_closes_at: string;
  check_in_opens_at: string;
  warning_at: string;
  starts_at: string;
  ends_at: string;
};

/**
 * 把"本地时间输入"转成数据库要的 UTC 字段。
 *
 * ⚠️ `event_date` **由本函数推导**，不让管理员单独填写。
 *    规范要求它必须等于 `starts_at` 在活动时区下的日期；
 *    让人手填很容易出现"北京凌晨的活动被填成前一天"这类错误。
 */
export function toEventScheduleRecord(input: EventInput): EventScheduleRecord {
  const starts = zonedTimeToUtc(input.startsAtLocal, input.timezone);
  return {
    event_date: zonedDateOf(starts, input.timezone),
    timezone: input.timezone,
    registration_opens_at: zonedTimeToUtc(
      input.registrationOpensAtLocal,
      input.timezone,
    ).toISOString(),
    registration_closes_at: zonedTimeToUtc(
      input.registrationClosesAtLocal,
      input.timezone,
    ).toISOString(),
    check_in_opens_at: zonedTimeToUtc(input.checkInOpensAtLocal, input.timezone).toISOString(),
    warning_at: zonedTimeToUtc(input.warningAtLocal, input.timezone).toISOString(),
    starts_at: starts.toISOString(),
    ends_at: zonedTimeToUtc(input.endsAtLocal, input.timezone).toISOString(),
  };
}

/** 克隆活动时的输入：只需要新活动的标题与开始时间。 */
export const cloneEventSchema = z.object({
  eventId: z.guid({ error: "活动标识格式不正确" }),
  title,
  startsAtLocal: localDateTime,
});

export type CloneEventInput = z.infer<typeof cloneEventSchema>;

/** 活动赛制的启用开关。 */
export const eventFormatsSchema = z.object({
  eventId: z.guid({ error: "活动标识格式不正确" }),
  enabledFormatIds: z.array(z.guid({ error: "赛制标识格式不正确" })).max(50),
});

export type EventFormatsInput = z.infer<typeof eventFormatsSchema>;

/** 每个赛制可以设置本次活动的辩题（motion）。 */
export const eventFormatMotionSchema = z.object({
  eventId: z.guid({ error: "活动标识格式不正确" }),
  formatId: z.guid({ error: "赛制标识格式不正确" }),
  motion: z.string().trim().max(500, { error: "最多 500 字" }),
});
