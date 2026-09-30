/**
 * 裁判历史统计（Phase 8 / P8-4）。
 *
 * 主规格第 15 节 Phase 8："**Judge history** and profile/paradigm experience."
 *
 * -----------------------------------------------------------------------------
 * ⚠️ 与"学生历史"同一个约束在这里也适用，而且更强
 *
 * 学生那侧规范说"先不要做公开排名"。裁判这侧，**规范完全没有要求任何
 * 裁判之间的比较或排名** —— 它只要求"裁判自己的历史"。
 *
 * 因此这个模块只产出**一位裁判自己的**统计，没有任何跨裁判的字段。
 * 裁判的分数松紧是敏感信息：一旦公开，"这位裁判给分低"会变成选裁判的依据，
 * 而规范第 10 节要的是**校准**（让尺度一致），不是**挑选**。
 *
 * 界面上也据此只显示"你判了多少场、什么赛制、平均给分"，
 * 不显示"你比其他裁判高还是低"。
 */

/** 这位裁判判过的一场。 */
export type JudgeHistoryEntry = {
  formatCode: string;
  /** 提交时间（ISO）；未提交的为 null */
  submittedAt: string | null;
  /** 评分表状态 */
  status: "draft" | "submitted" | "reopened" | "resubmitted" | "published";
  /** 这场给了多少分（该场的平均，或没有分数时为 null） */
  averageScoreGiven: number | null;
  /** 这场是否被管理员重开过 */
  wasReopened: boolean;
  /** 判决理由的字数；没有时为 null */
  reasonLength: number | null;
};

export type JudgeHistory = {
  /** 被指派的场次总数（含还没提交的） */
  assigned: number;
  /** 已交回的场次（已提交 / 已重交 / 已发布） */
  completed: number;
  /** 还没交回的（草稿 / 已重开 / 还没开始） */
  outstanding: number;
  /** 完成率（百分比，一位小数）；没有指派时 null */
  completionRate: number | null;
  /** 被重开过的场次数量 */
  reopenedCount: number;
  byFormat: { formatCode: string; completed: number }[];
  averageScoreGiven: number | null;
  averageReasonLength: number | null;
};

/** 交回即算完成 —— 与看板口径一致（`reopened` 不算）。 */
function isCompleted(status: JudgeHistoryEntry["status"]): boolean {
  return status === "submitted" || status === "resubmitted" || status === "published";
}

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

export function summarizeJudgeHistory(entries: readonly JudgeHistoryEntry[]): JudgeHistory {
  const completedEntries = entries.filter((entry) => isCompleted(entry.status));

  const scores = completedEntries
    .map((entry) => entry.averageScoreGiven)
    .filter((score): score is number => typeof score === "number");

  const reasonLengths = completedEntries
    .map((entry) => entry.reasonLength)
    .filter((length): length is number => typeof length === "number");

  const formatCodes = [...new Set(completedEntries.map((entry) => entry.formatCode))];

  return {
    assigned: entries.length,
    completed: completedEntries.length,
    outstanding: entries.length - completedEntries.length,
    completionRate:
      entries.length === 0 ? null : round1((completedEntries.length / entries.length) * 100),
    /*
     * 被重开过几次是**这位裁判自己的**信息，用于自我校准 ——
     * 它**不是**用来评价裁判的指标。重开也可能是因为管理员搞错了，
     * 因此界面上只陈述次数，不解读。
     */
    reopenedCount: entries.filter((entry) => entry.wasReopened).length,
    byFormat: formatCodes
      .map((formatCode) => ({
        formatCode,
        completed: completedEntries.filter((entry) => entry.formatCode === formatCode).length,
      }))
      .sort((a, b) => b.completed - a.completed),
    averageScoreGiven:
      scores.length === 0
        ? null
        : round1(scores.reduce((sum, score) => sum + score, 0) / scores.length),
    /*
     * 平均理由长度是一个**自我校准**的提示：理由太短的场次多了，
     * 学生就看不懂结果。规范多处要求 RFD 至少 100 字。
     */
    averageReasonLength:
      reasonLengths.length === 0
        ? null
        : Math.round(reasonLengths.reduce((sum, length) => sum + length, 0) / reasonLengths.length),
  };
}
