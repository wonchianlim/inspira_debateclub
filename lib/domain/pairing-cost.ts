/**
 * 配对成本函数（主规格第 10.3 节）。
 *
 * 规范开篇明确：**V1 用的是透明的确定性启发式，不是机器学习。**
 * 因此这里只有一个可以逐项核对、逐项测试的加权公式 —— 没有任何"学习"或随机成分。
 *
 * ⚠️ **权重是规范给定的，不得改动。** 规范原文：
 *
 *     team_cost =
 *        1000 * eligibility_violation
 *         + 500 * unavailable_student
 *         + 100 * incomplete_team
 *         +  10 * rating_range
 *         +   4 * rating_standard_deviation
 *         +   2 * repeated_teammate_penalty
 *         -  50 * accepted_partner_bonus
 *
 *     成本越低越好。
 *
 * 规范还特别说明："资格与可用性在正常生成中是**硬约束**；给它们很大的权重是为了
 * 在**例外与人工分析**时仍然表达优先级。" 也就是说这两项**必须实现**，
 * 不能因为"反正是硬约束"就删掉 —— 人工调整时它们正是解释"为什么系统不推荐这样排"的依据。
 *
 * 单位说明（规范给了公式但没有逐项定义单位，这里明确写出来，避免实现者各自理解）：
 *   - eligibilityViolationCount / unavailableStudentCount：**人数**（候选队伍里有几个人不合格/不可用）；
 *   - incompleteTeam：**布尔**（队伍人数不足 team_size 时为 true），按 0/1 参与计算；
 *   - ratingRange：**评分极差**（最大值 − 最小值）；
 *   - ratingStandardDeviation：**总体标准差**（分母为人数，不是 n−1）；
 *   - repeatedTeammatePairCount：**以前做过队友的配对数**；
 *   - acceptedPartnerPairCount：**本队中"已接受搭档"的配对数**（每保留一对 −50）。
 *
 * 这些取值方式都写成**显式输入**而不是在函数内部猜测，因此使用方（以及测试）
 * 都能明确知道每个数字是怎么来的。
 */

/** 规范给定的权重。改这个表等于改算法，必须同时递增 `PAIRING_ALGORITHM_VERSION`。 */
export const TEAM_COST_WEIGHTS = {
  eligibilityViolation: 1000,
  unavailableStudent: 500,
  incompleteTeam: 100,
  ratingRange: 10,
  ratingStandardDeviation: 4,
  repeatedTeammate: 2,
  acceptedPartnerBonus: -50,
} as const;

/**
 * 算法版本。
 *
 * 规范第 10 节与 10.7 要求持久化"提案输入、评分、警告与**算法版本**"，
 * 让管理员能理解为什么给出某个建议。**任何会影响结果的改动都必须递增它** ——
 * 否则历史提案会变得无法解释（同样的版本号却对应两套算法）。
 */
export const PAIRING_ALGORITHM_VERSION = "1.0.0";

export type TeamCostComponents = {
  /** 候选队伍里有几个人不满足该赛制的资格 */
  eligibilityViolationCount: number;
  /** 候选队伍里有几个人当前不可用（未签到/未确认） */
  unavailableStudentCount: number;
  /** 队伍人数是否不足 */
  incompleteTeam: boolean;
  /** 评分极差（最大 − 最小）；单人队伍或全同分时为 0 */
  ratingRange: number;
  /** 评分的总体标准差 */
  ratingStandardDeviation: number;
  /** 以前做过队友的配对数 */
  repeatedTeammatePairCount: number;
  /** 本队中"已接受搭档"的配对数 */
  acceptedPartnerPairCount: number;
};

/** 评分极差：最大值 − 最小值。空数组或单人返回 0。 */
export function ratingRange(ratings: readonly number[]): number {
  if (ratings.length < 2) return 0;
  return Math.max(...ratings) - Math.min(...ratings);
}

/**
 * 总体标准差（分母是人数）。
 *
 * 用总体而不是样本标准差：这里的评分是**这个队伍的全部成员**，
 * 不是从更大群体里抽的样本，因此总体标准差才是正确的描述统计量。
 */
export function ratingStandardDeviation(ratings: readonly number[]): number {
  if (ratings.length === 0) return 0;
  const mean = ratings.reduce((sum, value) => sum + value, 0) / ratings.length;
  const variance = ratings.reduce((sum, value) => sum + (value - mean) ** 2, 0) / ratings.length;
  return Math.sqrt(variance);
}

/** 单项贡献。用于解释与测试：可以单独验证某个权重是否按给定倍数生效。 */
export function teamCostTerms(components: TeamCostComponents) {
  return [
    {
      key: "eligibilityViolation" as const,
      label: "资格违规",
      weight: TEAM_COST_WEIGHTS.eligibilityViolation,
      rawValue: components.eligibilityViolationCount,
    },
    {
      key: "unavailableStudent" as const,
      label: "成员不可用",
      weight: TEAM_COST_WEIGHTS.unavailableStudent,
      rawValue: components.unavailableStudentCount,
    },
    {
      key: "incompleteTeam" as const,
      label: "队伍不完整",
      weight: TEAM_COST_WEIGHTS.incompleteTeam,
      rawValue: components.incompleteTeam ? 1 : 0,
    },
    {
      key: "ratingRange" as const,
      label: "评分极差",
      weight: TEAM_COST_WEIGHTS.ratingRange,
      rawValue: components.ratingRange,
    },
    {
      key: "ratingStandardDeviation" as const,
      label: "评分标准差",
      weight: TEAM_COST_WEIGHTS.ratingStandardDeviation,
      rawValue: components.ratingStandardDeviation,
    },
    {
      key: "repeatedTeammate" as const,
      label: "重复队友",
      weight: TEAM_COST_WEIGHTS.repeatedTeammate,
      rawValue: components.repeatedTeammatePairCount,
    },
    {
      key: "acceptedPartnerBonus" as const,
      label: "已接受搭档（减分）",
      weight: TEAM_COST_WEIGHTS.acceptedPartnerBonus,
      rawValue: components.acceptedPartnerPairCount,
    },
  ].map((term) => ({ ...term, contribution: term.weight * term.rawValue }));
}

/** 按规范公式计算队伍成本。成本越低越好。 */
export function computeTeamCost(components: TeamCostComponents): number {
  return teamCostTerms(components).reduce((total, term) => total + term.contribution, 0);
}

/**
 * 成本的可读解释。
 *
 * 规范第 10.2 节末句要求"每一个不明显的分配都要产生一条**说明取舍的警告**"。
 * 光有一个总数是没法解释的，因此这里返回逐项贡献 ——
 * 管理员（以及将来的界面）可以看出"这次成本高是因为有 2 个人不合格"，
 * 而不是只知道一个数字。
 */
export function explainTeamCost(components: TeamCostComponents): {
  total: number;
  terms: ReturnType<typeof teamCostTerms>;
  /** 成本最高的那一项（最能解释"为什么贵"） */
  dominant: ReturnType<typeof teamCostTerms>[number] | null;
  /** 是否含有硬约束违规（资格/可用性），这种方案正常不应被选中 */
  hasHardConstraintViolation: boolean;
} {
  const terms = teamCostTerms(components);
  const total = terms.reduce((sum, term) => sum + term.contribution, 0);

  const positiveTerms = terms.filter((term) => term.contribution > 0);
  const dominant =
    positiveTerms.length === 0
      ? null
      : positiveTerms.reduce((worst, term) =>
          term.contribution > worst.contribution ? term : worst,
        );

  return {
    total,
    terms,
    dominant,
    hasHardConstraintViolation:
      components.eligibilityViolationCount > 0 || components.unavailableStudentCount > 0,
  };
}

/** 理想队伍（人数齐、资格齐、可用、评分完全相同、无重复队友、且含已接受搭档）。 */
export const IDEAL_TEAM_COST_COMPONENTS: TeamCostComponents = {
  eligibilityViolationCount: 0,
  unavailableStudentCount: 0,
  incompleteTeam: false,
  ratingRange: 0,
  ratingStandardDeviation: 0,
  repeatedTeammatePairCount: 0,
  acceptedPartnerPairCount: 1,
};
