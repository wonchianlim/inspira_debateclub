import { z } from "zod";

/**
 * 学生报名的输入校验。
 *
 * 这里只做格式校验。**能不能报名、能不能选某个赛制**由数据库的策略与函数决定
 * （`is_event_registration_open`、`is_format_selectable_for_registration`），
 * 应用层再做一次同样的判断只是为了给出中文提示，不是安全措施。
 */

export const registerForEventSchema = z.object({
  eventId: z.guid({ error: "活动标识格式不正确" }),
});

export const cancelRegistrationSchema = z.object({
  registrationId: z.guid({ error: "报名标识格式不正确" }),
});

/**
 * 保存赛制偏好。
 *
 * 表单提交的是**按偏好顺序排列的赛制 id**（前面的优先），
 * 服务端按顺序赋名次 1、2、3……。
 * 学生排顺序比填数字更自然，也不需要自己避免重复名次。
 */
export const saveFormatPreferencesSchema = z.object({
  registrationId: z.guid({ error: "报名标识格式不正确" }),
  formatIds: z
    .array(z.guid({ error: "赛制标识格式不正确" }))
    .max(20, { error: "最多选择 20 个赛制" }),
});

export type RegisterForEventInput = z.infer<typeof registerForEventSchema>;
export type CancelRegistrationInput = z.infer<typeof cancelRegistrationSchema>;
export type SaveFormatPreferencesInput = z.infer<typeof saveFormatPreferencesSchema>;

/** 报名状态的显示名称。 */
export const REGISTRATION_STATUS_LABELS = {
  registered: "已报名",
  cancelled: "已取消",
  late_cancelled: "已取消（迟）",
  checked_in: "已签到",
  no_show: "未到场",
} as const;

export type RegistrationStatus = keyof typeof REGISTRATION_STATUS_LABELS;

/**
 * 迟取消的说明文字。
 *
 * 规范第 9.2 节第 5 条：截止前取消记 `cancelled`，截止后记 `late_cancelled`。
 * 这句话必须让学生**在取消之前**看到，而不是取消之后才发现记录里多了个"迟"字。
 */
export const LATE_CANCELLATION_WARNING =
  "报名截止后取消会被记为「迟取消」，会影响你的历史记录。请在截止前决定。";
