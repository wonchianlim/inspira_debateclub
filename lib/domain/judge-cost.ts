/**
 * 裁判候选排序（主规格第 11 节）。
 *
 * ⚠️ **权重是规范给定的，不得改动：**
 *
 *     judge_cost =
 *         10 * total_times_judged_any_student_in_match
 *         +  6 * recent_times_judged_any_student_in_match
 *         +  3 * workload_count_for_event
 *
 *     成本越低越好。
 *
 * -----------------------------------------------------------------------------
 * ⚠️ 规范对"回避规则"有一条**明确限制**，这里严格照办：
 *
 *   "In V1, only repeated judging is a requested conflict rule.
 *    **Do not invent school/coach conflicts without product-owner confirmation**,
 *    but design the function so additional conflict rules can be added later."
 *
 * 也就是说：**我不能自己加"同校回避""教练回避""师生回避"这类规则。**
 * 本文件只实现"重复执裁"这一条（由前两个权重表达），
 * 并把结构留出扩展位 —— 见下面的 `JudgeConflictRule`。
 * 如果产品负责人希望增加回避规则，需要明确告知后再实现。
 */

/** 规范给定的裁判权重。 */
export const JUDGE_COST_WEIGHTS = {
  totalTimesJudgedAnyStudent: 10,
  recentTimesJudgedAnyStudent: 6,
  workloadForEvent: 3,
} as const;

export type JudgeCostComponents = {
  /** 这位裁判**历史上**执裁过本场任意学生的总次数 */
  totalTimesJudgedAnyStudentInMatch: number;
  /** 同上，但只统计**近期**（例如最近若干场） */
  recentTimesJudgedAnyStudentInMatch: number;
  /** 这位裁判在本活动上已经被指派的工作量 */
  workloadCountForEvent: number;
};

export const ZERO_JUDGE_COST: JudgeCostComponents = {
  totalTimesJudgedAnyStudentInMatch: 0,
  recentTimesJudgedAnyStudentInMatch: 0,
  workloadCountForEvent: 0,
};

export function judgeCostTerms(components: JudgeCostComponents) {
  return [
    {
      key: "totalTimesJudgedAnyStudent" as const,
      label: "历史执裁过本场学生",
      weight: JUDGE_COST_WEIGHTS.totalTimesJudgedAnyStudent,
      rawValue: components.totalTimesJudgedAnyStudentInMatch,
    },
    {
      key: "recentTimesJudgedAnyStudent" as const,
      label: "近期执裁过本场学生",
      weight: JUDGE_COST_WEIGHTS.recentTimesJudgedAnyStudent,
      rawValue: components.recentTimesJudgedAnyStudentInMatch,
    },
    {
      key: "workloadForEvent" as const,
      label: "本活动工作量",
      weight: JUDGE_COST_WEIGHTS.workloadForEvent,
      rawValue: components.workloadCountForEvent,
    },
  ].map((term) => ({ ...term, contribution: term.weight * term.rawValue }));
}

/** 按规范公式计算裁判成本。越低越好。 */
export function computeJudgeCost(components: JudgeCostComponents): number {
  return judgeCostTerms(components).reduce((total, term) => total + term.contribution, 0);
}

/** 可读解释，供推荐界面显示"为什么推荐这位裁判"。 */
export function explainJudgeCost(components: JudgeCostComponents) {
  const terms = judgeCostTerms(components);
  const total = terms.reduce((sum, term) => sum + term.contribution, 0);
  const positive = terms.filter((term) => term.contribution > 0);
  return {
    total,
    terms,
    dominant:
      positive.length === 0
        ? null
        : positive.reduce((worst, term) => (term.contribution > worst.contribution ? term : worst)),
  };
}

/**
 * 裁判候选的**资格条件**（规范第 11 节开头）。
 *
 * "Candidate judges must be approved, available for the event, qualified for the
 * format, checked in when live assignment occurs, and not already assigned to an
 * overlapping match."
 *
 * 这五条是**硬性条件**，不是成本项 —— 不满足的人根本不进入排序。
 * 因此做成一票否决的判定，而不是给一个很大的成本。
 */
export type JudgeEligibilityFacts = {
  /** 已批准 */
  approved: boolean;
  /** 该活动上可用 */
  availableForEvent: boolean;
  /** 该赛制有资格 */
  qualifiedForFormat: boolean;
  /** 现场指派时是否要求已签到 */
  liveAssignmentRequiresCheckIn: boolean;
  /** 已签到（仅在要求时才有意义） */
  checkedIn: boolean;
  /** 是否已经被指派到时间冲突的另一场比赛 */
  hasOverlappingAssignment: boolean;
};

export type JudgeEligibilityResult = {
  eligible: boolean;
  /** 不满足的原因（中文，可直接显示给管理员） */
  reasons: string[];
};

/** 判断一位裁判是否满足全部硬性资格条件。 */
export function checkJudgeEligibility(facts: JudgeEligibilityFacts): JudgeEligibilityResult {
  const reasons: string[] = [];
  if (!facts.approved) reasons.push("尚未通过审批");
  if (!facts.availableForEvent) reasons.push("在这个活动上没有登记为可用");
  if (!facts.qualifiedForFormat) reasons.push("没有该赛制的执裁资格");
  if (facts.liveAssignmentRequiresCheckIn && !facts.checkedIn) reasons.push("尚未签到");
  if (facts.hasOverlappingAssignment) reasons.push("已被指派到时间冲突的另一场比赛");
  return { eligible: reasons.length === 0, reasons };
}

/**
 * 回避规则的扩展位。
 *
 * 规范要求"把函数设计成将来可以加更多回避规则"。
 * 当前**只有一条**（重复执裁），由上面两个权重表达。
 * 这个类型存在是为了让扩展点显式可见，而不是散落在代码里；
 * **在得到产品负责人确认之前，不要往这里添加规则。**
 */
export type JudgeConflictRule = {
  key: string;
  label: string;
  /** 该规则产生的额外成本；当前未使用任何规则 */
  cost: (components: JudgeCostComponents) => number;
};

/** 当前生效的额外回避规则：**空**（规范限定 V1 只有重复执裁一条）。 */
export const ADDITIONAL_JUDGE_CONFLICT_RULES: readonly JudgeConflictRule[] = [];

/** 说明为什么这里是空的 —— 写在代码里，避免后来者以为是漏了。 */
export const JUDGE_CONFLICT_RULES_NOTE =
  "规范第 11 节明确限定 V1 只有『重复执裁』一条回避规则，并禁止在未获产品负责人确认时自行增加" +
  "同校/教练等回避。若需要更多规则，请先确认。";
