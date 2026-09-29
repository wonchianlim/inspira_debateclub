import { z } from "zod";

import { isValidOffsets } from "@/lib/domain/event-schedule";

/**
 * 系统设置的输入校验。
 *
 * 只覆盖**已知的**设置项，而不是做一个任意的 key/value 编辑器。
 * 理由：任意键值编辑更容易写坏系统（例如把偏移量写成负数或字符串），
 * 而目前真正需要调整的只有这几个时间偏移量。将来新增设置项时再扩展。
 */

const nonNegativeInteger = (label: string, max: number) =>
  z.coerce
    .number({ error: `${label}必须是数字` })
    .int({ error: `${label}必须是整数` })
    .min(0, { error: `${label}不能是负数` })
    .max(max, { error: `${label}不能超过 ${max}` });

export const scheduleSettingsSchema = z
  .object({
    registrationOpensDaysBefore: nonNegativeInteger("报名提前开放天数", 365),
    registrationClosesDaysBefore: nonNegativeInteger("报名提前截止天数", 365),
    checkInOpensMinutesBefore: nonNegativeInteger("签到提前分钟数", 1440),
    warningMinutesBefore: nonNegativeInteger("警示提前分钟数", 1440),
  })
  .superRefine((value, ctx) => {
    // 报名开放必须早于报名截止，否则推算出来的时间会违反数据库的
    // events_registration_window_valid 约束 —— 那时错误会出现在"新建活动"页面上，
    // 而不是出现在这里，非常难排查。因此在这一步就拦住。
    if (value.registrationOpensDaysBefore <= value.registrationClosesDaysBefore) {
      ctx.addIssue({
        code: "custom",
        path: ["registrationOpensDaysBefore"],
        message: "报名提前开放的天数必须大于提前截止的天数（否则报名窗口是倒置的）。",
      });
    }

    if (!isValidOffsets(value)) {
      ctx.addIssue({
        code: "custom",
        path: ["registrationClosesDaysBefore"],
        message: "这组数值不合法，请检查各项。",
      });
    }
  });

export type ScheduleSettingsInput = z.infer<typeof scheduleSettingsSchema>;
