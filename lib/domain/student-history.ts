/**
 * 学生辩论历史的统计（Phase 8 / P8-2）。
 *
 * 主规格第 15 节 Phase 8："**Student debate history** and published ballot archive."
 *
 * -----------------------------------------------------------------------------
 * ⚠️ 规范里有一条明确的约束，它决定了这个模块的形状：
 *
 *   JWSD §49、PF §61、BP §49 都写了同一句话：
 *   "**Do not immediately create public rankings.** These scores should primarily
 *    support development."
 *
 * 因此这个模块：
 *   - **只接受一个学生的数据**，接口上就无法算出"谁比谁高"；
 *   - **不产出名次或百分位**，只产出这个学生自己的纵向变化；
 *   - 对比赛数量很少的情况**不硬给结论**（见 `MIN_DEBATES_FOR_TREND`）。
 *
 * 把闸门做在**接口形状**上，而不是靠调用方自觉 —— 后者迟早会被绕过。
 */

/** 一场辩论里，这位学生自己的结果。 */
export type HistoryEntry = {
  formatCode: string;
  /** 计划开始时间（ISO） */
  scheduledStart: string;
  /** 胜负；BP 这类排名制没有胜负，为 null */
  outcome: "win" | "loss" | null;
  /** BP 的名次；其它赛制为 null */
  rank: number | null;
  /** 个人总分与此赛制的满分；没有个人总项时为 null */
  speakerTotal: number | null;
  speakerMax: number | null;
  /** 逐项分：字段键 → 值（只含该学生**适用**的字段） */
  categoryScores: Record<string, number>;
  /** 逐项分的显示名与满分 */
  categoryLabels: Record<string, { label: string; max: number }>;
};

export type FormatBreakdown = {
  formatCode: string;
  debates: number;
  wins: number;
  losses: number;
  averageTotal: number | null;
};

export type CategoryAverage = {
  key: string;
  label: string;
  /** 该项满分的平均值（跨不同满分时不能直接平均，见下方说明） */
  average: number;
  max: number;
  /** 该项在**这个赛制**里出现过几次 */
  count: number;
};

export type StudentHistory = {
  totalDebates: number;
  wins: number;
  losses: number;
  /** 没有胜负概念的场次（BP 排名制） */
  rankedOnly: number;
  /** 胜 / （胜+负）；没有胜负场次时为 null */
  winRate: number | null;
  averageTotal: number | null;
  highestTotal: number | null;
  byFormat: FormatBreakdown[];
  /** ⚠️ 按**赛制**分组的逐项平均 —— 不同赛制的满分不同，不能混在一起平均 */
  categoryAverages: { formatCode: string; items: CategoryAverage[] }[];
  recentTrend: {
    direction: "up" | "down" | "flat" | "unknown";
    /** 最近几场相对之前几场的平均分变化；样本不足时为 null */
    delta: number | null;
    /** 算出趋势用了几场 */
    sampleSize: number;
  };
};

/**
 * 算趋势至少需要多少场。
 *
 * 规范没有给这个数字。取 4：少于 4 场时"最近两场 vs 前两场"的对比
 * 基本是噪声，给出"进步了/退步了"的结论会**误导学生**。
 * 这是**我的选择**，写在这里而不是藏在代码里。
 */
export const MIN_DEBATES_FOR_TREND = 4;

/** 趋势对比用几场作为"最近"。 */
const TREND_WINDOW = 2;

function average(values: number[]): number | null {
  if (values.length === 0) return null;
  return round1(values.reduce((sum, value) => sum + value, 0) / values.length);
}

/** 保留一位小数 —— 分数可能是半分，平均后需要收一下，避免 0.30000000000000004 */
function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

/**
 * 汇总一位学生的历史。
 *
 * ⚠️ 入参**必须只含这位学生自己的数据**。模块内部没有任何跨学生的比较 ——
 * 这是"不做公开排名"这条规范约束在代码里的落点。
 */
export function summarizeStudentHistory(entries: readonly HistoryEntry[]): StudentHistory {
  // 时间从早到晚，趋势才有意义
  const sorted = [...entries].sort((a, b) => a.scheduledStart.localeCompare(b.scheduledStart));

  const wins = sorted.filter((entry) => entry.outcome === "win").length;
  const losses = sorted.filter((entry) => entry.outcome === "loss").length;
  const rankedOnly = sorted.filter((entry) => entry.outcome === null).length;

  const totals = sorted
    .map((entry) => entry.speakerTotal)
    .filter((total): total is number => typeof total === "number");

  // ---- 按赛制分组 ----
  const formatCodes = [...new Set(sorted.map((entry) => entry.formatCode))];
  const byFormat: FormatBreakdown[] = formatCodes.map((formatCode) => {
    const group = sorted.filter((entry) => entry.formatCode === formatCode);
    const groupTotals = group
      .map((entry) => entry.speakerTotal)
      .filter((total): total is number => typeof total === "number");
    return {
      formatCode,
      debates: group.length,
      wins: group.filter((entry) => entry.outcome === "win").length,
      losses: group.filter((entry) => entry.outcome === "loss").length,
      averageTotal: average(groupTotals),
    };
  });

  /*
   * ---- 逐项平均，**按赛制分开** ----
   *
   * ⚠️ 不能跨赛制平均。WSDC 的"表达"满分是 40，1v1 的"论证"满分是 10 ——
   * 把它们放进同一个平均数里，得到的数字没有任何含义。
   * 而且**同一个字段键在不同赛制里含义也不同**（JWSD 的 strategy 与 PF 的 strategy
   * 满分分别是 20 与 6）。
   */
  const categoryAverages = formatCodes.map((formatCode) => {
    const group = sorted.filter((entry) => entry.formatCode === formatCode);
    const keys = [...new Set(group.flatMap((entry) => Object.keys(entry.categoryScores)))];

    const items: CategoryAverage[] = keys
      .map((key) => {
        const values = group
          .map((entry) => entry.categoryScores[key])
          .filter((value): value is number => typeof value === "number");
        const meta = group.find((entry) => entry.categoryLabels[key] !== undefined)?.categoryLabels[
          key
        ];
        const avg = average(values);
        if (values.length === 0 || avg === null || !meta) return null;
        return { key, label: meta.label, average: avg, max: meta.max, count: values.length };
      })
      .filter((item): item is CategoryAverage => item !== null)
      // 样本太少的项不给平均值 —— 一场的分数不叫"平均"
      .filter((item) => item.count >= 2);

    return { formatCode, items };
  });

  // ---- 趋势 ----
  // 只在**同一个赛制**内比较，否则满分不同，变化量没有意义
  const trendFormat =
    formatCodes.length === 1
      ? formatCodes[0]
      : // 多个赛制时，选场次最多的那一个
        (byFormat.slice().sort((a, b) => b.debates - a.debates)[0]?.formatCode ?? null);

  const trendEntries = trendFormat
    ? sorted.filter(
        (entry) => entry.formatCode === trendFormat && typeof entry.speakerTotal === "number",
      )
    : [];

  let direction: StudentHistory["recentTrend"]["direction"] = "unknown";
  let delta: number | null = null;

  if (trendEntries.length >= MIN_DEBATES_FOR_TREND) {
    const recent = trendEntries.slice(-TREND_WINDOW).map((entry) => entry.speakerTotal as number);
    const previous = trendEntries
      .slice(-TREND_WINDOW * 2, -TREND_WINDOW)
      .map((entry) => entry.speakerTotal as number);

    const recentAvg = average(recent);
    const previousAvg = average(previous);

    if (recentAvg !== null && previousAvg !== null) {
      delta = round1(recentAvg - previousAvg);
      // 半分制的赛制里，0.5 以内的差异不值得说成"进步"或"退步"
      direction = Math.abs(delta) < 0.5 ? "flat" : delta > 0 ? "up" : "down";
    }
  }

  return {
    totalDebates: sorted.length,
    wins,
    losses,
    rankedOnly,
    winRate: wins + losses === 0 ? null : round1((wins / (wins + losses)) * 100),
    averageTotal: average(totals),
    highestTotal: totals.length === 0 ? null : Math.max(...totals),
    byFormat,
    categoryAverages,
    recentTrend: { direction, delta, sampleSize: trendEntries.length },
  };
}
