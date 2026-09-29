/**
 * 裁判是否**可以被指派**到某个赛制（纯领域逻辑）。
 *
 * 为什么现在就要做：Phase 2 负责把"裁判被批准了没有""有没有该赛制的资格"这些
 * **数据状态**做对，Phase 5 才真正做指派。如果没有一个统一的判断函数，
 * Phase 5 很容易各自写一份 `if` 来判断资格 —— 那样迟早会出现
 * "某条路径忘了检查审批状态，把未批准的裁判排进了比赛"。
 *
 * 这里把规则集中成一个纯函数，并用穷举测试覆盖所有组合。
 */

import type { Database } from "@/lib/supabase/database.types";
import type { ProfileStatus } from "@/lib/validation/admin";

/** 与数据库枚举 `judge_approval_status` 一致。 */
export const JUDGE_APPROVAL_STATUSES = ["pending", "approved", "rejected", "suspended"] as const;

export type JudgeApprovalStatus = (typeof JUDGE_APPROVAL_STATUSES)[number];

/**
 * 编译期断言：与数据库枚举完全一致。
 * 不一致时 `tsc` 直接失败（`npm run ci` 会跑 typecheck），而不是等到运行时才发现。
 */
type DatabaseApprovalStatus = Database["public"]["Enums"]["judge_approval_status"];
type AssertSame<A, B> = [A] extends [B] ? ([B] extends [A] ? true : false) : false;
/** 若下面一行报错，说明本文件的状态清单与数据库枚举已经不一致。 */
const _statusesMatchDatabase: AssertSame<JudgeApprovalStatus, DatabaseApprovalStatus> = true;
void _statusesMatchDatabase;

export const JUDGE_APPROVAL_LABELS: Record<JudgeApprovalStatus, string> = {
  pending: "待审批",
  approved: "已批准",
  rejected: "已拒绝",
  suspended: "已暂停",
};

export const JUDGE_APPROVAL_DESCRIPTIONS: Record<JudgeApprovalStatus, string> = {
  pending: "刚注册的裁判处于这个状态，还不能被指派到任何比赛。",
  approved: "可以被指派到其已获资格的那个赛制。",
  rejected: "申请未通过，不能被指派。",
  suspended: "暂时停止使用，不能被指派。",
};

/** 某位裁判在某个赛制上的资格记录。 */
export type JudgeQualification = {
  formatId: string;
  approved: boolean;
};

export type JudgeEligibilityInput = {
  /** 账号本身的状态。账号被停用时，即使裁判已批准也不能被指派。 */
  profileStatus: ProfileStatus;
  approvalStatus: JudgeApprovalStatus;
  qualifications: readonly JudgeQualification[];
};

export type EligibilityFailureCode =
  /** 账号本身不是"正常"状态 */
  | "account_not_active"
  /** 裁判审批状态不是"已批准" */
  | "not_approved"
  /** 完全没有该赛制的资格记录 */
  | "no_qualification"
  /** 有该赛制的资格记录，但尚未批准 */
  | "qualification_not_approved";

export type EligibilityResult =
  | { eligible: true; formatId: string }
  | { eligible: false; formatId: string; code: EligibilityFailureCode; message: string };

/**
 * 判断某位裁判能否被指派到指定赛制。
 *
 * 检查顺序（从"最根本"到"最具体"）：
 *   1. 账号是否正常；
 *   2. 裁判身份是否已被批准；
 *   3. 是否有该赛制的资格，且该资格已批准。
 *
 * 顺序会影响**提示信息**：先说最根本的原因，管理员才知道该先解决什么。
 */
export function checkJudgeEligibility(
  judge: JudgeEligibilityInput,
  formatId: string,
): EligibilityResult {
  if (judge.profileStatus !== "active") {
    return {
      eligible: false,
      formatId,
      code: "account_not_active",
      message: "该裁判的账号当前不是「正常」状态，不能被指派。",
    };
  }

  if (judge.approvalStatus !== "approved") {
    return {
      eligible: false,
      formatId,
      code: "not_approved",
      message: `该裁判的审批状态是「${JUDGE_APPROVAL_LABELS[judge.approvalStatus]}」，只有「已批准」的裁判才能被指派。`,
    };
  }

  const qualification = judge.qualifications.find((entry) => entry.formatId === formatId);

  if (!qualification) {
    return {
      eligible: false,
      formatId,
      code: "no_qualification",
      message: "该裁判没有这个赛制的资格记录。",
    };
  }

  if (!qualification.approved) {
    return {
      eligible: false,
      formatId,
      code: "qualification_not_approved",
      message: "该裁判有这个赛制的记录，但资格尚未批准。",
    };
  }

  return { eligible: true, formatId };
}

/** 便捷判断：只关心能不能，不关心原因。 */
export function isJudgeEligible(judge: JudgeEligibilityInput, formatId: string): boolean {
  return checkJudgeEligibility(judge, formatId).eligible;
}

/** 列出该裁判**可以被指派**的全部赛制。派界面用它来决定显示哪些选项。 */
export function eligibleFormatIds(judge: JudgeEligibilityInput): string[] {
  if (judge.profileStatus !== "active" || judge.approvalStatus !== "approved") return [];
  return judge.qualifications
    .filter((entry) => entry.approved)
    .map((entry) => entry.formatId)
    .sort();
}
