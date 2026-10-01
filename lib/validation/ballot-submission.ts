import { z } from "zod";

/**
 * 裁判提交评分表的输入校验（Phase 7 / P7-4）。
 *
 * ⚠️ 这里只做**形状**校验。真正的内容校验（分数区间、漏打、必填项）
 * 由 `validateBallotData` / `canSubmitBallot` 按**模板 schema** 执行 ——
 * 因为那些规则是配置出来的，不能写死在 Zod 里。
 */

export const ballotValuesSchema = z.object({
  matchId: z.guid({ error: "比赛标识格式不正确" }),
  winnerTeamId: z.guid({ error: "胜方标识格式不正确" }).or(z.literal("")).optional(),
  reasonForDecision: z.string().max(4000).optional(),
  /** 逐项分：`学生id|字段键` → 值 */
  speakerScoresJson: z.string(),
  /** 整场与按队伍的值：字段键 或 `队伍id|字段键` → 值 */
  otherValuesJson: z.string(),
});

/**
 * 保存草稿时的**版本**字段（乐观并发）。
 *
 * ⚠️ 语义必须分清楚：
 *   * 字段**存在但为空**（`expectedUpdatedAt=""`）= "我读的时候还没有这一行"，
 *     也就是这份草稿是新建的 —— 服务端仍然要检查"现在是不是已经有人建了"；
 *   * 字段**不存在**（同时 `overwrite=true`）= 裁判看过冲突提示后**明确选择覆盖**。
 *
 * 两者混起来就会出现"过期的自动保存把别人的修改悄悄冲掉"，
 * 而那正是规范 §9.3 明令禁止的（"never silently overwrite a newer ballot"）。
 */
export const ballotVersionSchema = z.object({
  expectedUpdatedAt: z.string().trim().max(40).optional(),
  overwrite: z.literal("true").optional(),
});

export const BALLOT_STATUS_LABELS = {
  draft: "草稿",
  submitted: "已提交",
  reopened: "已重开",
  resubmitted: "已重交",
  published: "已发布",
} as const;

/**
 * 供界面提示用。
 *
 * ⚠️ **不能**放在 `lib/judge/ballot-actions.ts` 里 —— 那个文件有 `"use server"`，
 * 只允许导出 async 函数。我在这一个文件上已经连着踩了两次
 * （先是 `ballotDraftNote`，Phase 7 之前是 `TEMPLATE_PERMISSION_NOTE`）。
 */
export const BALLOT_DRAFT_NOTE =
  "草稿可以随时保存，不必填完。提交时会按模板检查分数范围、必填项与是否漏人。";
