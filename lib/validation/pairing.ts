import { z } from "zod";

/**
 * 配对提案相关的输入校验（Phase 4 / P4-6）。
 */

export const generateProposalSchema = z.object({
  eventId: z.guid({ error: "活动标识格式不正确" }),
});

export const setTeamLockSchema = z.object({
  teamId: z.guid({ error: "队伍标识格式不正确" }),
  locked: z.enum(["true", "false"], { error: "锁定状态不正确" }),
});

export const dissolveTeamSchema = z.object({
  teamId: z.guid({ error: "队伍标识格式不正确" }),
});

export const confirmProposalSchema = z.object({
  proposalId: z.guid({ error: "提案标识格式不正确" }),
});

export const PAIRING_PROPOSAL_STATUS_LABELS = {
  draft: "草稿（尚未确认）",
  confirmed: "已确认",
  superseded: "已被新的生成取代",
} as const;

export const TEAM_STATUS_LABELS = {
  proposed: "系统提案",
  confirmed: "已确认",
  dissolved: "已解散",
} as const;

/**
 * 说明"警告不是错误"。
 *
 * 规范第 10.2 节要求对每个不明显的分配给出警告。这些警告大多**不影响提案可用**，
 * 但如果界面上不加说明，管理员会以为出了问题而不敢确认。
 */
export const WARNING_IS_INFORMATIONAL =
  "这些提示说明系统在取舍时做了什么选择，不是错误。看完后可以直接确认。";

// -----------------------------------------------------------------------------
// 裁判指派（Phase 5 / P5-4）
// -----------------------------------------------------------------------------

export const assignJudgeSchema = z.object({
  matchId: z.guid({ error: "比赛标识格式不正确" }),
  judgeId: z.guid({ error: "裁判标识格式不正确" }),
  role: z.enum(["chair", "panelist"], { error: "请选择主裁或评委" }),
});

export const cancelJudgeAssignmentSchema = z.object({
  assignmentId: z.guid({ error: "指派标识格式不正确" }),
});

export const JUDGE_ROLE_LABELS = {
  chair: "主裁",
  panelist: "评委",
} as const;

/**
 * 逐人移动队员（Phase 5 / P5-7，规范 10.7 第 1 条）。
 *
 * 前端只提交"从哪支队、哪位学生、到哪支队"三个 id；
 * 全部跨表条件（同活动同赛制、目标有空位、名单未锁定）由数据库函数判定，
 * 应用层不重复实现 —— 重复实现一定会与数据库漂移。
 */
export const moveTeamMemberSchema = z.object({
  fromTeamId: z.guid({ error: "源队伍标识格式不正确" }),
  participationId: z.guid({ error: "参与标识格式不正确" }),
  toTeamId: z.guid({ error: "目标队伍标识格式不正确" }),
});
