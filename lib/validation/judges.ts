import { z } from "zod";

import { JUDGE_APPROVAL_STATUSES } from "@/lib/domain/judge-eligibility";

/**
 * 裁判审批与赛制资格的输入校验。
 *
 * 与 `lib/validation/admin.ts` 同样的原则：这里只做格式校验与中文提示，
 * **真正的权限判定在数据库 RLS 与触发器上**。
 */

export const judgeProfileIdSchema = z.guid({ error: "裁判标识格式不正确" });

export const updateJudgeApprovalSchema = z.object({
  judgeProfileId: judgeProfileIdSchema,
  approvalStatus: z.enum(JUDGE_APPROVAL_STATUSES, { error: "请选择有效的审批状态" }),
});

export const setJudgeQualificationsSchema = z.object({
  judgeProfileId: judgeProfileIdSchema,
  // 表单提交的是"该裁判已获批准的赛制"集合；未勾选表示未获资格
  formatIds: z.array(z.guid({ error: "赛制标识格式不正确" })).max(50, { error: "赛制数量异常" }),
});

export const judgeExperienceNotesSchema = z.object({
  judgeProfileId: judgeProfileIdSchema,
  paradigm: z.string().trim().max(200, { error: "最多 200 字" }).optional(),
  experienceNotes: z.string().trim().max(2000, { error: "最多 2000 字" }).optional(),
});

export type UpdateJudgeApprovalInput = z.infer<typeof updateJudgeApprovalSchema>;
export type SetJudgeQualificationsInput = z.infer<typeof setJudgeQualificationsSchema>;
export type JudgeExperienceNotesInput = z.infer<typeof judgeExperienceNotesSchema>;
