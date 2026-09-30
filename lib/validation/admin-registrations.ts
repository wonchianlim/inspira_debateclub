import { z } from "zod";

import { partnerCodeSchema } from "@/lib/validation/partners";

/**
 * 管理员对报名的人工修正（Phase 3 / P3-6）。
 *
 * 规范第 9.2 节第 7 条："Managers review unresolved eligibility/preferences
 * before pairing." —— 界面要能看出"谁还需要处理"，并且能直接修正。
 */

export const ADMIN_REGISTRATION_STATUSES = [
  "registered",
  "cancelled",
  "late_cancelled",
  "checked_in",
  "no_show",
] as const;

export type AdminRegistrationStatus = (typeof ADMIN_REGISTRATION_STATUSES)[number];

export const adminSetRegistrationStatusSchema = z.object({
  registrationId: z.guid({ error: "报名标识格式不正确" }),
  status: z.enum(ADMIN_REGISTRATION_STATUSES, { error: "请选择有效的报名状态" }),
});

/**
 * 人工补报名。
 *
 * 用**搭档码**指定学生，而不是让管理员从一长串名单里翻 ——
 * 与 P3-4 的搭档请求保持同一套机制，学生也只需要报出自己的码即可。
 */
export const adminAddRegistrationSchema = z.object({
  eventId: z.guid({ error: "活动标识格式不正确" }),
  partnerCode: partnerCodeSchema,
});
