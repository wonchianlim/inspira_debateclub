/**
 * 提案警告的类型（Phase 4 / P4-6）。
 *
 * 警告来自两个来源：参与分配（`participation-allocation`）与队伍生成（`team-formation`）。
 * 两者都存进 `pairing_proposals.warnings`（JSONB），因此需要一个能同时容纳它们的形状。
 *
 * 刻意**不**把这两个模块的警告类型合并成一个枚举 ——
 * 它们各自归属不同的算法步骤，合并会让"这条警告是谁产生的"变得含糊。
 * 这里只描述**存储后**的公共字段。
 */

export type PairingWarning = {
  /** 警告代号，例如 preference_not_viable、incomplete_team_remainder */
  code: string;
  /** 直接可展示的中文说明 */
  message: string;
  /** 涉及的赛制 id（有的话） */
  formatId?: string;
  /** 涉及的赛制代号（有的话），用于显示 */
  formatCode?: string;
  /** 涉及的学生（有的话） */
  studentId?: string;
  studentIds?: string[];
  /** 来自哪一步骤：分配还是队伍生成 */
  source?: "allocation";
};

/**
 * 警告归到哪一组（用于界面分组）。
 *
 * ⚠️ 返回的是**稳定的英文键**，不是给人看的标签 ——
 * 界面语言固定为英文（2026-10-01 产品负责人决定），而"键"不该跟着语言变：
 * 用中文当键会让"比较用的字符串"和"显示用的字符串"混在一起，
 * 换个语言就得改判断逻辑。英文标签由界面自己给。
 */
export type PairingWarningCategory = "action" | "info";

export function warningCategory(code: string): PairingWarningCategory {
  switch (code) {
    // 这两类意味着有人**打不上辩论**，管理员必须处理
    case "no_viable_format":
    case "incomplete_team_remainder":
    case "partner_group_too_large":
      return "action";
    default:
      return "info";
  }
}
