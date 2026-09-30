/**
 * 比赛成本与正反方分配（主规格第 10.4、10.5 节）。
 *
 * ⚠️ **权重是规范给定的，不得改动：**
 *
 *     match_cost =
 *         12 * average_rating_spread
 *         +  8 * repeat_opponent_count
 *         +  3 * repeated_judge_exposure_estimate
 *         +  2 * side_imbalance_after_assignment
 *
 *     成本越低越好。
 *
 * 规范对 BP 特别加了一句限制：
 * **"For BP, compare both overall room spread and adjacent team strength;
 * do not reduce four-team placement to a binary winner model."**
 * 也就是说四支队伍的分组**不能**简化成"强/弱"两档，必须同时看
 * **整场的总体跨度**与**相邻队伍之间的强度差**。
 */

import {
  PAIRING_ALGORITHM_VERSION,
  ratingRange,
  ratingStandardDeviation,
} from "@/lib/domain/pairing-cost";

/** 规范给定的比赛权重。改这个表等于改算法，必须同时递增算法版本。 */
export const MATCH_COST_WEIGHTS = {
  averageRatingSpread: 12,
  repeatOpponent: 8,
  repeatedJudgeExposure: 3,
  sideImbalance: 2,
} as const;

export type MatchCostComponents = {
  /** 评分跨度。BP 用 `britishParliamentaryRatingSpread()` 计算（见下）。 */
  averageRatingSpread: number;
  /** 这些队伍以前交手过的次数 */
  repeatOpponentCount: number;
  /** 同一位裁判已经执裁过本场学生的次数估计 */
  repeatedJudgeExposureEstimate: number;
  /** 正反方分配之后的不平衡程度（0 = 完全平衡） */
  sideImbalanceAfterAssignment: number;
};

export const ZERO_MATCH_COST: MatchCostComponents = {
  averageRatingSpread: 0,
  repeatOpponentCount: 0,
  repeatedJudgeExposureEstimate: 0,
  sideImbalanceAfterAssignment: 0,
};

export function matchCostTerms(components: MatchCostComponents) {
  return [
    {
      key: "averageRatingSpread" as const,
      label: "评分跨度",
      weight: MATCH_COST_WEIGHTS.averageRatingSpread,
      rawValue: components.averageRatingSpread,
    },
    {
      key: "repeatOpponent" as const,
      label: "重复对手",
      weight: MATCH_COST_WEIGHTS.repeatOpponent,
      rawValue: components.repeatOpponentCount,
    },
    {
      key: "repeatedJudgeExposure" as const,
      label: "重复裁判暴露",
      weight: MATCH_COST_WEIGHTS.repeatedJudgeExposure,
      rawValue: components.repeatedJudgeExposureEstimate,
    },
    {
      key: "sideImbalance" as const,
      label: "正反方不平衡",
      weight: MATCH_COST_WEIGHTS.sideImbalance,
      rawValue: components.sideImbalanceAfterAssignment,
    },
  ].map((term) => ({ ...term, contribution: term.weight * term.rawValue }));
}

/** 按规范公式计算比赛成本。越低越好。 */
export function computeMatchCost(components: MatchCostComponents): number {
  return matchCostTerms(components).reduce((total, term) => total + term.contribution, 0);
}

/** 可读的成本解释（与队伍成本同一套做法，便于管理员理解为什么这样排）。 */
export function explainMatchCost(components: MatchCostComponents) {
  const terms = matchCostTerms(components);
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
 * BP 的评分跨度。
 *
 * -----------------------------------------------------------------------------
 * ⚠️ 这里有一处**规范没有给出组合方式、由我明确写出并标注**的解释
 *
 * 规范说 BP 要"同时比较**整场总体跨度**与**相邻队伍强度**"，
 * 但没有说明这两个量如何合成 `average_rating_spread` 那一个数字。
 *
 * 这里的做法（写出来是为了让产品负责人能看见并推翻）：
 *   - **总体跨度**：全部四支队伍平均评分中的最大值 − 最小值；
 *   - **相邻强度**：四支队伍按平均评分排序后，**相邻两队差值的最大值**
 *     （也就是"这个房间里最大的那道断档"）；
 *   - 取两者的**平均值**作为 `average_rating_spread`。
 *
 * 为什么不能只取总体跨度：四队 3/3/9/9 与 3/6/6/9 的总体跨度相同（都是 6），
 * 但前者是"两强两弱、中间断档"，后者是"四队均匀过渡" —— 比赛体验差别很大。
 * 加上相邻强度就能把这两种情况区分开，正是规范那句限制想要的效果。
 *
 * ⚠️ **我最初用的是"相邻差值的平均值"，它区分不了这两种情况 —— 实测发现：**
 *
 *     3/3/9/9 的相邻差是 [0, 6, 0]，平均 2；3/6/6/9 的相邻差是 [3, 0, 3]，平均 2。
 *     两者算出来**都是 4.0**，等于绕了一圈又没区分开。
 *
 * 换成"相邻差值的**最大值**"之后，3/3/9/9 得 6.0、3/6/6/9 得 4.5，才真正区分开。
 * 这条记录留在这里，是因为"平均值把断档抹平"这件事很反直觉，
 * 后来者很可能再次写成平均值。
 * -----------------------------------------------------------------------------
 */
export function britishParliamentaryRatingSpread(teamAverageRatings: readonly number[]): number {
  if (teamAverageRatings.length < 2) return 0;

  const sorted = [...teamAverageRatings].sort((a, b) => a - b);
  const overallSpread = (sorted[sorted.length - 1] as number) - (sorted[0] as number);

  /*
   * 取相邻差值的**最大值**而不是平均值。
   * 平均值会把断档抹平：3/3/9/9 与 3/6/6/9 的平均相邻差都是 2，
   * 于是"两强两弱"与"均匀过渡"算出来一模一样，违背了规范那句限制的本意。
   */
  let largestAdjacentGap = 0;
  for (let index = 1; index < sorted.length; index += 1) {
    largestAdjacentGap = Math.max(
      largestAdjacentGap,
      (sorted[index] as number) - (sorted[index - 1] as number),
    );
  }

  return (overallSpread + largestAdjacentGap) / 2;
}

/**
 * 正反方分配之后的不平衡程度（规范 10.4 的 `side_imbalance_after_assignment`）。
 *
 * 定义："拿了 PROP/OG 一侧的队伍"与"拿了 OPP/CO 一侧的队伍"在**评分总和**上的差距。
 * 0 表示两侧强度完全相等。
 *
 * 规范没有给出公式，这里取最直白的"两侧总分差"，
 * 并除以队伍人数无关的量级 —— 不做归一化，因为它只用于**同一场比赛内**比较不同分配方案，
 * 量级一致即可。
 */
export function sideImbalance(
  sideARatings: readonly number[],
  sideBRatings: readonly number[],
): number {
  const sum = (values: readonly number[]) => values.reduce((total, value) => total + value, 0);
  return Math.abs(sum(sideARatings) - sum(sideBRatings));
}

/**
 * 各种赛制的正反方位置。
 *
 * 规范 10.5：PF/JWSD/WSDC/1v1 用 `PROP`/`OPP`；BP 用 `OG`/`OO`/`CG`/`CO`。
 * 规范第 6.4 节同时明确**不要**用数据库枚举来固定这些取值，因此它们定义在领域层。
 */
export const FORMAT_SIDE_POSITIONS: Record<string, readonly string[]> = {
  PF: ["PROP", "OPP"],
  JWSD: ["PROP", "OPP"],
  WSDC: ["PROP", "OPP"],
  ONE_V_ONE: ["PROP", "OPP"],
  BP: ["OG", "OO", "CG", "CO"],
};

/** 判断某个位置是不是该赛制的合法取值。 */
export function isValidSidePosition(formatCode: string, position: string): boolean {
  return (FORMAT_SIDE_POSITIONS[formatCode] ?? []).includes(position);
}

/**
 * 种子哈希（规范第 10.5 节）。
 *
 * 规范原文："Break equal scores deterministically with a **seeded hash based on
 * event ID and team ID** so reruns with unchanged inputs give the same result."
 *
 * 因此这里用 **FNV-1a** 对 `${eventId}:${teamId}` 求一个确定的哈希值。
 * 刻意**不用** `Math.random()`，也不依赖对象遍历顺序 —— 那会让"重跑结果一致"失效。
 *
 * 用 FNV-1a 而不是更复杂的哈希：它的实现只有几行、容易核对，
 * 而这里只需要"稳定且分布尚可"，不需要密码学强度。
 */
export function seededHash(seed: string): number {
  let hash = 0x811c9dc5; // FNV offset basis
  for (let index = 0; index < seed.length; index += 1) {
    hash ^= seed.charCodeAt(index);
    // FNV prime 16777619，用移位与加法避免 32 位溢出时的精度问题
    hash = (hash + ((hash << 1) + (hash << 4) + (hash << 7) + (hash << 8) + (hash << 24))) >>> 0;
  }
  return hash >>> 0;
}

/** 规范 10.5 要求的种子：由活动 ID 与队伍 ID 组合而成。 */
export function tieBreakSeed(eventId: string, teamId: string): string {
  return `${eventId}:${teamId}`;
}

/**
 * 按"种子哈希"给一批 id 排序。
 *
 * 用于在**评分完全相同**时决定正反方归谁 —— 结果确定，且与传入顺序无关。
 */
export function orderBySeed(eventId: string, teamIds: readonly string[]): string[] {
  return [...teamIds].sort((a, b) => {
    const hashA = seededHash(tieBreakSeed(eventId, a));
    const hashB = seededHash(tieBreakSeed(eventId, b));
    if (hashA !== hashB) return hashA - hashB;
    // 哈希也相同时退回 id 比较，保证是全序、不会出现"顺序不定"
    return a.localeCompare(b);
  });
}

/** 供上层写入提案时使用。与队伍生成共用同一个版本号。 */
export const MATCH_ALGORITHM_VERSION = PAIRING_ALGORITHM_VERSION;

/** 供测试与文档核对：评分统计量复用队伍成本里那一份实现，避免两处漂移。 */
export { ratingRange, ratingStandardDeviation };
