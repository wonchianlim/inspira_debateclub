/**
 * 队伍生成（主规格第 10.3 节）。
 *
 * 规范给出的七步：
 *   1. 若人数合法，**先锁定已接受且互相可用的搭档组**；
 *   2. 其余学生按 `rating_snapshot` 排序，**再按学生 UUID 稳定打破平局**；
 *   3. 生成 `team_size` 大小的候选组；
 *   4. 用成本函数给每个候选组打分；
 *   5. 选择**互不重叠**且总成本最低的候选组集合；
 *   6. 标记余数，并提出"在赛制之间做最小移动"的建议。
 *
 * 规范的目标是"**评分相近的搭档**"。重复队友只是**轻惩罚**，
 * 因为稳定的搭档关系是被允许的。
 * 规范末句特别强调：**"Accepted partner requests override rating similarity
 * unless impossible."**（已接受的搭档请求优先于评分相近，除非确实做不到。）
 *
 * -----------------------------------------------------------------------------
 * 关于"候选组生成"与"互不重叠的最优集合"的取舍（必须说清楚）
 *
 * 规范第 3、5 步字面上是"生成候选组 → 选总成本最低的互不重叠集合"。
 * 后者是**集合划分问题**（set packing），一般情形下是 NP 难的。
 *
 * 这里没有假装求全局最优，而是利用问题本身的结构：
 *
 *   - 成本函数里与评分有关的项（极差、标准差）在**按评分排序后按连续窗口分组**时
 *     达到最优 —— 对"最小化组内极差之和"这类目标是标准结论：
 *     把排序后相邻的人分在一起，不会比交叉分组更差；
 *   - "已接受搭档"是**硬性的优先项**，因此先锁定、再用最接近评分的人补位，
 *     而不是让评分去拆散已经互相答应的搭档。
 *
 * 结果是一个**确定性、可解释**的方案，而不是"看起来像最优"的黑箱。
 * 任何与"理想情况"的偏离都会产生一条警告。
 */

import {
  type TeamCostComponents,
  computeTeamCost,
  explainTeamCost,
  ratingRange,
  ratingStandardDeviation,
} from "@/lib/domain/pairing-cost";

/** 一位可以进入队伍的学生。 */
export type TeamCandidate = {
  studentId: string;
  /** 本活动该赛制的评分快照 */
  rating: number;
  /** 是否满足该赛制资格（不满足也允许出现，会产生很大的成本并被警告） */
  eligible: boolean;
  /** 当前是否可用（签到/确认状态） */
  available: boolean;
  /** 与他**互相**接受搭档的学生 id（已过滤为同一赛制、同样可用） */
  acceptedPartnerStudentIds: readonly string[];
  /** 以前做过队友的学生 id（重复队友按规范只是轻惩罚） */
  previousTeammateStudentIds: readonly string[];
};

export type TeamFormationFormat = {
  formatId: string;
  code: string;
  /** 一支队伍几个人（来自数据库配置，不在代码里写死） */
  teamSize: number;
};

export type FormedTeam = {
  memberStudentIds: string[];
  /** 该队伍的平均评分（保留两位小数），便于界面显示 */
  averageRating: number;
  cost: number;
  /** 成本逐项解释，供管理员理解"为什么这么排" */
  costBreakdown: ReturnType<typeof explainTeamCost>;
  /**
   * 是否来自"已接受的搭档请求"。
   * 规范要求这类队伍**优先于评分相近**，因此单独标出来。
   */
  fromAcceptedPartner: boolean;
  /** 是否由人工锁定（本引擎不产生，留给管理员的锁定流程） */
  locked: boolean;
};

export type TeamFormationWarningCode =
  /** 已接受的搭档组人数超过一支队伍，无法全部满足 */
  | "partner_group_too_large"
  /** 为已接受的搭档补位时，找不到评分相近的人 */
  | "partner_completion_imperfect"
  /** 需要补的分数差较大 */
  | "large_rating_spread"
  /** 有人不满足资格却被编入队伍 */
  | "eligibility_violation"
  /** 有人当前不可用却被编入队伍 */
  | "unavailable_member"
  /** 剩下的人凑不满一支队伍 */
  | "incomplete_team_remainder"
  /** 与以前的队友重复 */
  | "repeated_teammate";

export type TeamFormationWarning = {
  code: TeamFormationWarningCode;
  message: string;
  studentIds?: string[];
};

export type TeamFormationResult = {
  teams: FormedTeam[];
  /** 没能进入任何队伍的学生（需要管理员人工处理） */
  remainderStudentIds: string[];
  warnings: TeamFormationWarning[];
  /** 所有队伍的总成本，便于比较不同方案 */
  totalCost: number;
};

/** 计算一组人的平均评分。空组返回 0。 */
function averageRating(ratings: readonly number[]): number {
  if (ratings.length === 0) return 0;
  const mean = ratings.reduce((sum, value) => sum + value, 0) / ratings.length;
  return Math.round(mean * 100) / 100;
}

/**
 * 找出"已接受搭档"构成的连通组。
 *
 * 为什么用连通组而不是两两配对：队伍人数可能是 3 或 4。
 * 三个人互相接受时应当组成**同一支队伍**，而不是被拆成一对加一个落单。
 *
 * 只考虑**双向**接受：单向请求不算 —— 对方还没答应，规范说的是
 * "accepted partner"（已接受）。
 */
function acceptedPartnerGroups(candidates: readonly TeamCandidate[]): string[][] {
  const ids = new Set(candidates.map((candidate) => candidate.studentId));
  const byId = new Map(candidates.map((candidate) => [candidate.studentId, candidate] as const));

  // 邻接表：只保留互相接受的边
  const neighbours = new Map<string, Set<string>>();
  for (const candidate of candidates) neighbours.set(candidate.studentId, new Set());
  for (const candidate of candidates) {
    for (const partnerId of candidate.acceptedPartnerStudentIds) {
      if (!ids.has(partnerId)) continue;
      const partner = byId.get(partnerId);
      if (!partner) continue;
      if (!partner.acceptedPartnerStudentIds.includes(candidate.studentId)) continue;
      neighbours.get(candidate.studentId)?.add(partnerId);
      neighbours.get(partnerId)?.add(candidate.studentId);
    }
  }

  const seen = new Set<string>();
  const groups: string[][] = [];
  // 按 id 排序遍历，保证结果确定
  for (const candidate of [...candidates].sort((a, b) => a.studentId.localeCompare(b.studentId))) {
    const start = candidate.studentId;
    if (seen.has(start)) continue;
    if ((neighbours.get(start)?.size ?? 0) === 0) continue;

    const stack = [start];
    const group: string[] = [];
    while (stack.length > 0) {
      const current = stack.pop() as string;
      if (seen.has(current)) continue;
      seen.add(current);
      group.push(current);
      for (const next of neighbours.get(current) ?? []) {
        if (!seen.has(next)) stack.push(next);
      }
    }
    if (group.length > 1) groups.push(group.sort());
  }

  // 组之间也按最小 id 排序，保证顺序确定
  return groups.sort((a, b) => (a[0] as string).localeCompare(b[0] as string));
}

/** 按规范第 4 步计算一支候选队伍的成本。 */
function scoreTeam(
  memberStudentIds: readonly string[],
  byId: Map<string, TeamCandidate>,
  format: TeamFormationFormat,
): { cost: number; breakdown: ReturnType<typeof explainTeamCost> } {
  const members = memberStudentIds.map((id) => byId.get(id)).filter(Boolean) as TeamCandidate[];
  const ratings = members.map((member) => member.rating);

  const previousPairs = new Set<string>();
  for (const member of members) {
    for (const otherId of member.previousTeammateStudentIds) {
      if (!memberStudentIds.includes(otherId)) continue;
      // 用排序后的组合去重，避免同一对算两次
      const pair = [member.studentId, otherId].sort().join("|");
      previousPairs.add(pair);
    }
  }

  // 统计本队中"已接受搭档"的配对数
  let acceptedPairs = 0;
  for (const member of members) {
    for (const otherId of member.acceptedPartnerStudentIds) {
      if (!memberStudentIds.includes(otherId)) continue;
      const pair = [member.studentId, otherId].sort().join("|");
      previousPairs.delete(pair);
      acceptedPairs += 1;
    }
  }
  // 上面每个配对会被数两次（双方各一次）
  acceptedPairs = Math.floor(acceptedPairs / 2);

  const components: TeamCostComponents = {
    eligibilityViolationCount: members.filter((member) => !member.eligible).length,
    unavailableStudentCount: members.filter((member) => !member.available).length,
    incompleteTeam: memberStudentIds.length < format.teamSize,
    ratingRange: ratingRange(ratings),
    ratingStandardDeviation: ratingStandardDeviation(ratings),
    repeatedTeammatePairCount: previousPairs.size,
    acceptedPartnerPairCount: acceptedPairs,
  };

  return { cost: computeTeamCost(components), breakdown: explainTeamCost(components) };
}

/**
 * 为某个赛制生成队伍。
 *
 * @param candidates 该赛制已分配到参与的全体学生
 * @param format     赛制（含队伍人数）
 */
export function formTeams(
  candidates: readonly TeamCandidate[],
  format: TeamFormationFormat,
): TeamFormationResult {
  const byId = new Map(candidates.map((candidate) => [candidate.studentId, candidate] as const));
  const warnings: TeamFormationWarning[] = [];
  const teams: FormedTeam[] = [];

  const takeTeam = (memberStudentIds: string[], fromAcceptedPartner: boolean) => {
    const sorted = [...memberStudentIds].sort();
    const { cost, breakdown } = scoreTeam(sorted, byId, format);
    teams.push({
      memberStudentIds: sorted,
      averageRating: averageRating(sorted.map((id) => (byId.get(id) as TeamCandidate).rating)),
      cost,
      costBreakdown: breakdown,
      fromAcceptedPartner,
      locked: false,
    });
  };

  // ---------------------------------------------------------------------------
  // 第 1 步：锁定已接受的搭档组
  // ---------------------------------------------------------------------------
  const consumed = new Set<string>();
  /** 人数不足 team_size 的搭档组，稍后用最接近评分的人补齐 */
  const seeds: string[][] = [];

  for (const group of acceptedPartnerGroups(candidates)) {
    if (group.length === format.teamSize) {
      // 人数正好 —— 直接锁定（规范："lock ... if group size is legal"）
      for (const id of group) consumed.add(id);
      takeTeam(group, true);
      continue;
    }

    if (group.length > format.teamSize) {
      /*
       * 规范没有定义"搭档组大于一支队伍"时怎么办。
       * 这里不擅自替产品决定"留下谁"，而是**保留能凑成的完整队伍、
       * 其余的人回到普通池子**，并明确警告让管理员处理。
       */
      warnings.push({
        code: "partner_group_too_large",
        studentIds: group,
        message:
          `有 ${group.length} 位同学互相接受了搭档，但 ${format.code} 一支队伍是 ` +
          `${format.teamSize} 人，无法全部满足。系统只锁定了其中 ${format.teamSize} 人，` +
          "其余同学已回到普通池子，请管理员确认是否要调整。",
      });
      const lockedPart = group.slice(0, format.teamSize);
      for (const id of lockedPart) consumed.add(id);
      takeTeam(lockedPart, true);
      continue;
    }

    // 人数不足：作为种子，稍后补齐
    seeds.push(group);
  }

  /*
   * ⚠️ 先把"种子成员"也标记为已占用，**再**构造剩余池子。
   *
   * 这是实测抓到的缺陷：种子（已接受搭档的两人）在这一步之前还没进 consumed，
   * 于是构造出的剩余池子里**包含种子成员自己**；补位时又选中了他们，
   * 得到 ['s1','s1','s2'] 这种同一人出现两次的队伍。
   * 下游的队伍成员与比赛名单会完全错乱。
   */
  for (const seed of seeds) {
    for (const id of seed) consumed.add(id);
  }

  // ---------------------------------------------------------------------------
  // 第 2 步：其余学生按"评分，再按 id"稳定排序
  // ---------------------------------------------------------------------------
  const remaining = candidates
    .filter((candidate) => !consumed.has(candidate.studentId))
    .sort((a, b) => a.rating - b.rating || a.studentId.localeCompare(b.studentId));

  const pool = [...remaining];

  // ---------------------------------------------------------------------------
  // 第 3-4 步：给每个种子补位（挑评分最接近的人），再对剩下的人按连续窗口分组
  // ---------------------------------------------------------------------------

  // 种子按"组内最小 id"排序，保证确定性
  for (const seed of [...seeds].sort((a, b) => (a[0] as string).localeCompare(b[0] as string))) {
    const members = [...seed];
    const needed = format.teamSize - members.length;

    let imperfect = false;
    for (let index = 0; index < needed; index += 1) {
      if (pool.length === 0) break;
      const seedRatings = members.map((id) => (byId.get(id) as TeamCandidate).rating);
      const seedMean = seedRatings.reduce((sum, value) => sum + value, 0) / seedRatings.length;

      // 选评分最接近种子均值的人；评分相同时按 id 稳定选择
      // 再滤一次 members：即使池子构造有误，也绝不能把同一个人放进队伍两次
      const choosable = pool.filter((candidate) => !members.includes(candidate.studentId));
      if (choosable.length === 0) break;

      const chosen = choosable.reduce((best, current) => {
        const bestDistance = Math.abs(best.rating - seedMean);
        const currentDistance = Math.abs(current.rating - seedMean);
        if (currentDistance < bestDistance) return current;
        if (currentDistance > bestDistance) return best;
        return current.studentId.localeCompare(best.studentId) < 0 ? current : best;
      });

      // 差距过大时如实记录，而不是假装这条搭档队伍"评分相近"
      if (Math.abs(chosen.rating - seedMean) >= 3) imperfect = true;
      members.push(chosen.studentId);
      pool.splice(pool.indexOf(chosen), 1);
    }

    for (const id of members) consumed.add(id);

    if (imperfect) {
      warnings.push({
        code: "partner_completion_imperfect",
        studentIds: members,
        message:
          `为满足已接受的搭档请求，${format.code} 有一支队伍补入了评分差距较大的同学。` +
          "搭档请求优先于评分相近（规范第 10.3 节），但这会影响比赛质量，请管理员留意。",
      });
    }
    takeTeam(members, true);
  }

  // 剩下的人按"评分，再按 id"排序后，**按连续窗口分组**
  const sortedPool = [...pool].sort(
    (a, b) => a.rating - b.rating || a.studentId.localeCompare(b.studentId),
  );
  for (let index = 0; index + format.teamSize <= sortedPool.length; index += format.teamSize) {
    const group = sortedPool.slice(index, index + format.teamSize);
    takeTeam(
      group.map((candidate) => candidate.studentId),
      false,
    );
  }

  const remainderStudentIds = sortedPool
    .slice(Math.floor(sortedPool.length / format.teamSize) * format.teamSize)
    .map((candidate) => candidate.studentId)
    .sort();

  // ---------------------------------------------------------------------------
  // 第 6 步：标记余数并给出建议
  // ---------------------------------------------------------------------------
  if (remainderStudentIds.length > 0) {
    warnings.push({
      code: "incomplete_team_remainder",
      studentIds: remainderStudentIds,
      message:
        `${format.code} 还剩 ${remainderStudentIds.length} 人凑不满一支 ${format.teamSize} 人的队伍。` +
        "可以调整他们的赛制、邀请其他同学报名，或由管理员人工决定如何处理。",
    });
  }

  // ---------------------------------------------------------------------------
  // 逐队如实报告问题（资格、可用性、评分差距、重复队友）
  // ---------------------------------------------------------------------------
  for (const team of teams) {
    const members = team.memberStudentIds.map((id) => byId.get(id) as TeamCandidate);

    const ineligible = members.filter((member) => !member.eligible);
    if (ineligible.length > 0) {
      warnings.push({
        code: "eligibility_violation",
        studentIds: ineligible.map((member) => member.studentId),
        message: `有一支 ${format.code} 队伍里有 ${ineligible.length} 位同学不满足该赛制资格。`,
      });
    }

    const unavailable = members.filter((member) => !member.available);
    if (unavailable.length > 0) {
      warnings.push({
        code: "unavailable_member",
        studentIds: unavailable.map((member) => member.studentId),
        message: `有一支 ${format.code} 队伍里有 ${unavailable.length} 位同学当前不可用（未签到或未确认）。`,
      });
    }

    const spread = ratingRange(members.map((member) => member.rating));
    if (spread >= 3) {
      warnings.push({
        code: "large_rating_spread",
        studentIds: team.memberStudentIds,
        message: `有一支 ${format.code} 队伍的评分相差 ${spread} 分，比赛可能一边倒。`,
      });
    }

    // 重复队友：规范说这只是**轻惩罚**（稳定搭档是被允许的），因此只提示
    const previousPairs = new Set<string>();
    for (const member of members) {
      for (const otherId of member.previousTeammateStudentIds) {
        if (!team.memberStudentIds.includes(otherId)) continue;
        if (member.acceptedPartnerStudentIds.includes(otherId)) continue;
        previousPairs.add([member.studentId, otherId].sort().join("|"));
      }
    }
    if (previousPairs.size > 0) {
      warnings.push({
        code: "repeated_teammate",
        studentIds: team.memberStudentIds,
        message:
          `有一支 ${format.code} 队伍里有 ${previousPairs.size} 对以前做过队友的同学。` +
          "稳定的搭档是被允许的，因此这只是提示，不是错误。",
      });
    }
  }

  return {
    teams: teams.sort((a, b) =>
      (a.memberStudentIds[0] as string).localeCompare(b.memberStudentIds[0] as string),
    ),
    remainderStudentIds,
    warnings,
    totalCost: teams.reduce((sum, team) => sum + team.cost, 0),
  };
}
