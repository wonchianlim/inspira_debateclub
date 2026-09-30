import { z } from "zod";

/**
 * 签到的输入校验（Phase 6 / 规范第 2.8 节）。
 *
 * ⚠️ 这些 schema **只做格式校验**。签到是否开放、报名是否有效、
 * 是否已经签到过 —— 全部由服务端按**时间戳**判断（规范第 17 节：
 * "Compute late cancellation, warning, and overdue behavior from timestamps,
 *  not browser-local assumptions"）。
 */

export const checkInSchema = z.object({
  eventId: z.guid({ error: "活动标识格式不正确" }),
});

export const manualCheckInSchema = z.object({
  eventId: z.guid({ error: "活动标识格式不正确" }),
  studentId: z.guid({ error: "学生标识格式不正确" }),
});

export const judgeCheckInSchema = z.object({
  judgeId: z.guid({ error: "裁判标识格式不正确" }),
});

export const CHECK_IN_METHOD_LABELS = {
  self: "学生自助签到",
  admin: "管理员代签",
} as const;
