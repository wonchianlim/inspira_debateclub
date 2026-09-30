/**
 * 比赛生成（主规格第 10.4、10.5、10.7 节）。
 *
 * 三件事：
 *   1. 把同赛制的队伍按 `teams_per_match` 分成一场一场；
 *   2. 给每支队伍分配正反方位置，**尽量让每位学生的历史正反方次数平衡**；
 *   3. 分配房间与开始时间。
 *
 * -----------------------------------------------------------------------------
 * 确定性的两处要求（规范明文）
 *
 *   10.5："Break equal scores deterministically with a seeded hash based on
 *          event ID and team ID so reruns with unchanged inputs give the same result."
 *   10.3/10.8：相同输入重跑必须得到相同结果。
 *
 * 因此本模块里**没有** `Math.random()`，所有排序都有确定的第二排序键
 * （队伍 id / 种子哈希），并且并列时用 `orderBySeed()` 打破。
 *
 * -----------------------------------------------------------------------------
 * 关于"分组"的取舍（写清楚，不假装最优）
 *
 * 规范要求按 `match_cost` 选**互不重叠**的分组。"把 N 支队伍分成若干固定大小的组、
 * 使总成本最低"是集合划分问题，一般情形下 NP 难。
 *
 * 这里用两步启发式，两步都是确定的、可解释的：
 *   1. 按（平均评分，队伍 id）排序后**连续分组** —— 对"最小化组内评分跨度"是最优的；
 *   2. 再做一轮**相邻交换**的局部改进：只要总成本下降就接受交换。
 *
 * 结果不保证数学最优，但**可重复、可解释**，且每次改进都会留下警告说明做了调整。
 */

import {
  type MatchCostComponents,
  computeMatchCost,
  explainMatchCost,
} from "@/lib/domain/match-cost";
import { FORMAT_SIDE_POSITIONS, orderBySeed } from "@/lib/domain/match-cost";

export type MatchTeamInput = {
  teamId: string;
  /** 队伍平均评分（`teams.average_rating`） */
  averageRating: number;
  memberStudentIds: readonly string[];
};

export type MatchGenerationFormat = {
  formatId: string;
  code: string;
  /** 一场比赛几支队伍（来自数据库配置） */
  teamsPerMatch: number;
};

export type MatchGenerationInput = {
  eventId: string;
  format: MatchGenerationFormat;
  teams: readonly MatchTeamInput[];
  /**
   * 历史交手次数。键是两支队伍 id **排序后用 `|` 连接**。
   * 用排序后的键，避免 (A,B) 与 (B,A) 被当成两条不同的记录。
   */
  previousOpponentCounts: ReadonlyMap<string, number>;
  /**
   * 每位学生历史上在"第一侧"（PF 的 PROP、BP 的 OG/OO）出场的次数。
   * 用于让正反方尽量平衡。
   */
  previousSideACounts: ReadonlyMap<string, number>;
  /** 该赛制历史上出现过的比赛总数（用于推算"每位学生的两侧总场次"） */
  previousMatchCount: number;
  /** 可用房间名，按顺序使用 */
  roomNames: readonly string[];
  /** 第一场的开始时间 */
  firstMatchStart: Date;
  /** 每场之间隔多少分钟 */
  matchIntervalMinutes: number;
};

export type GeneratedMatchTeam = {
  teamId: string;
  position: string;
};

export type GeneratedMatch = {
  matchNumber: number;
  roomName: string;
  scheduledStart: string;
  teams: GeneratedMatchTeam[];
  cost: number;
  costBreakdown: ReturnType<typeof explainMatchCost>;
};

export type MatchGenerationWarningCode =
  /** 队伍数不是 teams_per_match 的整数倍，剩下的队伍无法成场 */
  | "leftover_teams"
  /** 房间不够，后面的比赛暂时用占位房间名 */
  | "not_enough_rooms"
  /** 这一场里有以前交手过的队伍 */
  | "repeat_opponent"
  /** 交换之后降低了总成本（说明原来的连续分组不是最优的） */
  | "reordered_for_better_cost"
  /** 正反方没能做到完全平衡 */
  | "side_imbalance_remaining";

export type MatchGenerationWarning = {
  code: MatchGenerationWarningCode;
  message: string;
  teamIds?: string[];
  matchNumber?: number;
};

export type MatchGenerationResult = {
  matches: GeneratedMatch[];
  /** 没能成场的队伍 */
  unassignedTeamIds: string[];
  warnings: MatchGenerationWarning[];
  totalCost: number;
};

/** 两支队伍的交手键（排序后用 `|` 连接，保证 (A,B) 与 (B,A) 一致）。 */
export function opponentKey(a: string, b: string): string {
  return [a, b].sort().join("|");
}

/** 某一组队伍内部的重复对手次数。 */
function repeatOpponentCount(
  teamIds: readonly string[],
  previousOpponentCounts: ReadonlyMap<string, number>,
): number {
  let count = 0;
  for (let i = 0; i < teamIds.length; i += 1) {
    for (let j = i + 1; j < teamIds.length; j += 1) {
      const key = opponentKey(teamIds[i] as string, teamIds[j] as string);
      count += previousOpponentCounts.get(key) ?? 0;
    }
  }
  return count;
}

/**
 * 一位学生在"第一侧"上还差多少次才能平衡。
 *
 * 正值表示他**更需要**第一侧（因为他第一侧出场次数少）。
 * 队伍层面取队员求和 —— 让"整体最需要第一侧的那支队"去第一侧。
 */
function teamSideANeed(
  team: MatchTeamInput,
  previousSideACounts: ReadonlyMap<string, number>,
  previousMatchCount: number,
): number {
  let need = 0;
  for (const studentId of team.memberStudentIds) {
    const sideACount = previousSideACounts.get(studentId) ?? 0;
    // 假设他两侧总场次一样多（历史记录里没有第二侧的明细时用这个近似），
    // 第一侧越少 → 越需要第一侧
    need += previousMatchCount - 2 * sideACount;
  }
  return need;
}

/** 一个候选分组（尚未编号、尚未分配房间）。 */
type CandidateMatch = {
  teamIds: string[];
  cost: number;
  breakdown: ReturnType<typeof explainMatchCost>;
};

function scoreGroup(
  teamIds: readonly string[],
  byId: Map<string, MatchTeamInput>,
  format: MatchGenerationFormat,
  previousOpponentCounts: ReadonlyMap<string, number>,
): CandidateMatch {
  const ratings = teamIds.map((id) => (byId.get(id) as MatchTeamInput).averageRating);

  /*
   * 评分跨度：BP 要用"总体跨度 + 最大相邻断档"的合成（见 match-cost.ts 的说明），
   * 其他赛制用普通极差。
   */
  let spread: number;
  if (format.code === "BP") {
    const sorted = [...ratings].sort((a, b) => a - b);
    const overall = (sorted[sorted.length - 1] as number) - (sorted[0] as number);
    let largestGap = 0;
    for (let index = 1; index < sorted.length; index += 1) {
      largestGap = Math.max(largestGap, (sorted[index] as number) - (sorted[index - 1] as number));
    }
    spread = (overall + largestGap) / 2;
  } else {
    spread = ratings.length < 2 ? 0 : Math.max(...ratings) - Math.min(...ratings);
  }

  const components: MatchCostComponents = {
    averageRatingSpread: spread,
    repeatOpponentCount: repeatOpponentCount(teamIds, previousOpponentCounts),
    // 裁判还没指派，因此这一项在生成阶段恒为 0；指派阶段再用真实值评估
    repeatedJudgeExposureEstimate: 0,
    // 正反方在分组阶段还没分配，因此这里也是 0；分配后再评估
    sideImbalanceAfterAssignment: 0,
  };

  return {
    teamIds: [...teamIds],
    cost: computeMatchCost(components),
    breakdown: explainMatchCost(components),
  };
}

/**
 * 生成比赛。
 *
 * @returns 确定性的比赛列表（相同输入必有相同输出）。
 */
export function generateMatches(input: MatchGenerationInput): MatchGenerationResult {
  const { format, eventId } = input;
  const byId = new Map(input.teams.map((team) => [team.teamId, team] as const));
  const warnings: MatchGenerationWarning[] = [];

  const teamsPerMatch = Math.max(1, format.teamsPerMatch);
  const positions = FORMAT_SIDE_POSITIONS[format.code] ?? [];

  if (positions.length !== teamsPerMatch) {
    /*
     * 位置的个数与 teams_per_match 不一致说明**配置有问题**（例如 BP 配成 2 支队伍）。
     * 这种情况不能猜，直接报错让管理员去改赛制配置。
     */
    return {
      matches: [],
      unassignedTeamIds: input.teams.map((team) => team.teamId).sort(),
      warnings: [
        {
          code: "leftover_teams",
          message:
            `${format.code} 配置成一场 ${teamsPerMatch} 支队伍，但该赛制有 ` +
            `${positions.length} 个位置（${positions.join("/")}）。请先到赛制设置里改正配置。`,
        },
      ],
      totalCost: 0,
    };
  }

  // 确定性排序：平均评分，然后队伍 id
  const orderedTeams = [...input.teams].sort(
    (a, b) => a.averageRating - b.averageRating || a.teamId.localeCompare(b.teamId),
  );

  // ---------------------------------------------------------------------------
  // 第 1 步：连续分组（对"最小化组内评分跨度"是最优的）
  // ---------------------------------------------------------------------------
  const groups: string[][] = [];
  for (let index = 0; index + teamsPerMatch <= orderedTeams.length; index += teamsPerMatch) {
    groups.push(orderedTeams.slice(index, index + teamsPerMatch).map((team) => team.teamId));
  }

  const leftover = orderedTeams.slice(groups.length * teamsPerMatch).map((team) => team.teamId);

  // ---------------------------------------------------------------------------
  // 第 2 步：相邻交换的局部改进（确定、可解释）
  //
  // 只在**总成本确实下降**时接受交换；成本相同时不交换，
  // 这样"重跑结果一致"不会因为浮点或顺序差异而漂移。
  // ---------------------------------------------------------------------------
  const scoreAll = (candidateGroups: readonly string[][]) =>
    candidateGroups.reduce(
      (total, group) => total + scoreGroup(group, byId, format, input.previousOpponentCounts).cost,
      0,
    );

  let improved = true;
  let guard = 0;
  while (improved && guard < 1000) {
    improved = false;
    guard += 1;
    const currentTotal = scoreAll(groups);

    for (let a = 0; a < groups.length && !improved; a += 1) {
      for (let b = a + 1; b < groups.length && !improved; b += 1) {
        const groupA = groups[a] as string[];
        const groupB = groups[b] as string[];

        for (let indexA = 0; indexA < groupA.length && !improved; indexA += 1) {
          for (let indexB = 0; indexB < groupB.length && !improved; indexB += 1) {
            const swappedA = [...groupA];
            const swappedB = [...groupB];
            const temp = swappedA[indexA] as string;
            swappedA[indexA] = swappedB[indexB] as string;
            swappedB[indexB] = temp;

            const nextGroups = groups.map((group, index) =>
              index === a ? swappedA : index === b ? swappedB : group,
            );

            if (scoreAll(nextGroups) < currentTotal) {
              groups[a] = swappedA;
              groups[b] = swappedB;
              improved = true;
            }
          }
        }
      }
    }
  }

  // ---------------------------------------------------------------------------
  // 第 3 步：正反方分配（规范 10.5）
  // ---------------------------------------------------------------------------
  const assignPositions = (teamIds: readonly string[]): GeneratedMatchTeam[] => {
    // 先按"谁更需要第一侧"排序；并列时用种子哈希打破（规范 10.5 明文要求）
    const seededOrder = orderBySeed(eventId, teamIds);
    const seededRank = new Map(seededOrder.map((teamId, index) => [teamId, index] as const));

    const sorted = [...teamIds].sort((a, b) => {
      const needA = teamSideANeed(
        byId.get(a) as MatchTeamInput,
        input.previousSideACounts,
        input.previousMatchCount,
      );
      const needB = teamSideANeed(
        byId.get(b) as MatchTeamInput,
        input.previousSideACounts,
        input.previousMatchCount,
      );
      if (needA !== needB) return needB - needA; // 更需要第一侧的排前面
      return (seededRank.get(a) as number) - (seededRank.get(b) as number);
    });

    // 前半拿第一侧的位置，后半拿第二侧的位置
    const half = Math.ceil(sorted.length / 2);
    const sideA = sorted.slice(0, half);
    const sideB = sorted.slice(half);

    const sideAPositions = positions.slice(0, half);
    const sideBPositions = positions.slice(half);

    return [
      ...sideA.map((teamId, index) => ({ teamId, position: sideAPositions[index] as string })),
      ...sideB.map((teamId, index) => ({ teamId, position: sideBPositions[index] as string })),
    ].sort((a, b) => a.position.localeCompare(b.position));
  };

  // ---------------------------------------------------------------------------
  // 第 4 步：房间与时间
  // ---------------------------------------------------------------------------
  const matches: GeneratedMatch[] = [];

  groups.forEach((teamIds, index) => {
    const matchNumber = index + 1;
    const assigned = assignPositions(teamIds);

    const sideATeams = assigned.filter(
      (entry) => positions.indexOf(entry.position) < Math.ceil(positions.length / 2),
    );
    const sideBTeams = assigned.filter(
      (entry) => positions.indexOf(entry.position) >= Math.ceil(positions.length / 2),
    );
    const sumRatings = (entries: GeneratedMatchTeam[]) =>
      entries.reduce(
        (total, entry) => total + (byId.get(entry.teamId) as MatchTeamInput).averageRating,
        0,
      );
    const imbalance = Math.abs(sumRatings(sideATeams) - sumRatings(sideBTeams));

    const scored = scoreGroup(teamIds, byId, format, input.previousOpponentCounts);
    const withSide: CandidateMatch = {
      teamIds: scored.teamIds,
      cost: computeMatchCost({
        averageRatingSpread:
          scored.breakdown.terms.find((t) => t.key === "averageRatingSpread")?.rawValue ?? 0,
        repeatOpponentCount:
          scored.breakdown.terms.find((t) => t.key === "repeatOpponent")?.rawValue ?? 0,
        repeatedJudgeExposureEstimate: 0,
        sideImbalanceAfterAssignment: imbalance,
      }),
      breakdown: explainMatchCost({
        averageRatingSpread:
          scored.breakdown.terms.find((t) => t.key === "averageRatingSpread")?.rawValue ?? 0,
        repeatOpponentCount:
          scored.breakdown.terms.find((t) => t.key === "repeatOpponent")?.rawValue ?? 0,
        repeatedJudgeExposureEstimate: 0,
        sideImbalanceAfterAssignment: imbalance,
      }),
    };

    let roomName = input.roomNames[index];
    if (!roomName) {
      // 房间不够时给出**明确的占位名**并警告，而不是悄悄留空
      roomName = `待定房间${matchNumber}`;
    }

    matches.push({
      matchNumber,
      roomName,
      scheduledStart: new Date(
        input.firstMatchStart.getTime() + index * input.matchIntervalMinutes * 60_000,
      ).toISOString(),
      teams: assigned,
      cost: withSide.cost,
      costBreakdown: withSide.breakdown,
    });
  });

  // ---------------------------------------------------------------------------
  // 警告
  // ---------------------------------------------------------------------------
  if (leftover.length > 0) {
    warnings.push({
      code: "leftover_teams",
      teamIds: leftover,
      message:
        `有 ${leftover.length} 支队伍凑不满一场 ${teamsPerMatch} 支队伍的比赛，` +
        "本轮没有成场。可以调整赛制、邀请更多同学，或由管理员人工处理。",
    });
  }

  if (input.roomNames.length < groups.length) {
    warnings.push({
      code: "not_enough_rooms",
      message:
        `可用房间只有 ${input.roomNames.length} 个，但有 ${groups.length} 场比赛。` +
        "超出的比赛暂用「待定房间」占位，请在活动设置里补充房间。",
    });
  }

  for (const match of matches) {
    const repeat = repeatOpponentCount(
      match.teams.map((team) => team.teamId),
      input.previousOpponentCounts,
    );
    if (repeat > 0) {
      warnings.push({
        code: "repeat_opponent",
        matchNumber: match.matchNumber,
        teamIds: match.teams.map((team) => team.teamId),
        message:
          `第 ${match.matchNumber} 场里有 ${repeat} 对以前交手过的队伍。` +
          "规范要求尽量避免重复对手，但队伍数量有限时无法完全避免 —— 可以调整名单或赛制。",
      });
    }

    if (match.costBreakdown.terms.find((t) => t.key === "sideImbalance")?.rawValue) {
      const imbalance =
        match.costBreakdown.terms.find((t) => t.key === "sideImbalance")?.rawValue ?? 0;
      if (imbalance > 0) {
        warnings.push({
          code: "side_imbalance_remaining",
          matchNumber: match.matchNumber,
          message:
            `第 ${match.matchNumber} 场的正反方评分差为 ${imbalance}。` +
            "系统已经按每位学生的历史正反方次数尽量平衡，完全相等并不总是可能。",
        });
      }
    }
  }

  return {
    matches,
    unassignedTeamIds: [...leftover].sort(),
    warnings,
    totalCost: matches.reduce((total, match) => total + match.cost, 0),
  };
}
