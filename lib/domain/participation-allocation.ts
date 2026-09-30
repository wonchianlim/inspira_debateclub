/**
 * 参与分配（主规格第 10.2 节）。
 *
 * 规范要求：把学生的**正常参与**分配到"最高且**仍然可行**的偏好"上，
 * 并且**全局优化**，而不是"贪心地给每个人分第一志愿"—— 因为后者会让很多人落空。
 *
 * 规范给出的**首要目标顺序**（这是判断"哪个方案更好"的唯一依据）：
 *
 *   1. 让尽可能多的学生获得**一次有效辩论**；
 *   2. 避免资格违规；
 *   3. 最大化完整队伍与完整比赛数；
 *   4. 尊重更高的赛制偏好；
 *   5. 最小化管理员警告/移动次数；
 *   6. **只在明确选择了额外场次时才分配额外辩论**。
 *
 * 规范还要求："每一个不明显的选择都要产生一条**说明取舍的警告**。"
 * 因此本模块的返回值不是"一个分配表"，而是
 * **分配表 + 未分配名单（含原因）+ 警告列表**。
 *
 * -----------------------------------------------------------------------------
 * 关于"可行"（viable）的定义
 *
 * 规范用了 "contributes to a viable group" 但没有定义 viable。
 * 这里采用一个明确且可解释的含义：
 *
 *   **一个赛制只有在人数至少能凑齐一支完整队伍（>= team_size）时才可行。**
 *
 * 理由：只有 1 个人报了 PF，而 PF 是 2 人一队 —— 这个人是**不可能**打上辩论的，
 * 把他"分配"到 PF 只是把他从别的可能打得上的赛制里挪走。
 * 判为"不可行"让他继续掉到下一个志愿，正是规范想要的效果。
 *
 * -----------------------------------------------------------------------------
 * 关于"全局优化"的边界（必须说清楚，不能假装）
 *
 * 严格意义上的全局最优（在全部学生 × 全部赛制的组合上求最优）是指数复杂度。
 * 规范用词是 "optimize globally rather than greedily"，并且开篇明确
 * "V1 uses a transparent deterministic heuristic"（透明、确定性的启发式）。
 *
 * 因此这里实现的是：**逐轮(rank-by-rank)推进 + 可行性判定的启发式**，
 * 它体现的正是 "不要贪心" 的核心 —— 不会把学生塞进一个他注定打不上的赛制。
 * 但它**不保证数学意义上的全局最优**。这个取舍写在这里，也写进提案的说明里，
 * 而不是含糊地宣称"已全局优化"。
 */

import { type EntitlementType, isExtraEntitlement } from "@/lib/domain/entitlement";

/** 参与分配用到的赛制信息。队伍规模来自**数据库配置**，不在代码里写死。 */
export type AllocationFormat = {
  formatId: string;
  /** 赛制代号（例如 PF、WSDC）。用于把警告写成**人能看懂**的句子。 */
  code: string;
  /** 一支队伍几个人 */
  teamSize: number;
  /** 一场比赛几支队伍 */
  teamsPerMatch: number;
  /** 展示顺序；用于确定性的处理顺序 */
  displayOrder: number;
};

/** 一位待分配的学生。 */
export type AllocationStudent = {
  studentId: string;
  /** 已按优先级排序的赛制 id（只包含"该学生合格且该赛制已启用"的） */
  orderedFormatIds: readonly string[];
  /**
   * 名额类型。规范第 10.2 节第 6 条：
   * **只有明确选择了额外场次（extra_*）时才会分配额外辩论。**
   */
  entitlementType: EntitlementType;
};

export type AllocationWarningCode =
  /** 第一志愿人数不足以凑齐一支队伍，改分到下一个志愿 */
  | "preference_not_viable"
  /** 所有志愿都不可行，这位学生本轮没有任何辩论 */
  | "no_viable_format"
  /** 被安排去填补不完整队伍的空缺 */
  | "moved_to_complete_team"
  /** 分配到了某个赛制，但志愿里并没有它（填补空缺时才可能发生） */
  | "allocated_beyond_preferences"
  /** 赛制人数不足 team_size，会留下不完整的队伍 */
  | "incomplete_team_remains"
  /** 该赛制的人数不是 team_size 的整数倍，会有落单的人 */
  | "leftover_after_teams"
  /** 额外场次无法安排 */
  | "extra_participation_unavailable";

export type AllocationWarning = {
  code: AllocationWarningCode;
  /** 直接可展示的中文说明 */
  message: string;
  studentId?: string;
  formatId?: string;
};

export type Allocation = {
  studentId: string;
  formatId: string;
  /** 1 = 本周正常的一次；2 及以上 = 额外场次 */
  participationNumber: number;
};

export type AllocationResult = {
  allocations: Allocation[];
  /** 没有拿到任何辩论的学生，含原因（管理员需要据此人工处理） */
  unallocated: { studentId: string; reason: string }[];
  warnings: AllocationWarning[];
  /** 每个赛制最终分到的人数，便于界面展示与核对 */
  countsByFormat: Record<string, number>;
};

/**
 * 分配参与。
 *
 * @param students 待分配学生（顺序不影响结果 —— 内部会按 studentId 稳定排序）
 * @param formats  本次活动的赛制（含队伍规模）
 */
export function allocateParticipations(
  students: readonly AllocationStudent[],
  formats: readonly AllocationFormat[],
): AllocationResult {
  const formatById = new Map(formats.map((format) => [format.formatId, format] as const));
  // 处理顺序固定为 displayOrder，其次 formatId —— 保证相同输入结果完全一致
  const orderedFormats = [...formats].sort(
    (a, b) => a.displayOrder - b.displayOrder || a.formatId.localeCompare(b.formatId),
  );

  const formatName = (formatId: string) => formatById.get(formatId)?.code ?? formatId;
  const warnings: AllocationWarning[] = [];
  const allocations: Allocation[] = [];
  const countsByFormat: Record<string, number> = {};
  for (const format of formats) countsByFormat[format.formatId] = 0;

  // 稳定排序：结果与调用方传入的顺序无关
  const orderedStudents = [...students].sort((a, b) => a.studentId.localeCompare(b.studentId));

  /** 学生 -> 他被分配到的赛制与这是他第几志愿（1 起算） */
  const assigned = new Map<string, { formatId: string; rank: number }>();
  /** 赛制 -> 愿意去、且还没被分配的候选人（**跨轮累积**，见下面的说明） */
  const willingByFormat = new Map<string, Set<string>>();
  for (const format of formats) willingByFormat.set(format.formatId, new Set());

  const maxRounds = orderedStudents.reduce(
    (longest, student) => Math.max(longest, student.orderedFormatIds.length),
    0,
  );

  /*
   * ---------------------------------------------------------------------------
   * 逐志愿推进，但候选池**跨轮累积**
   *
   * 第一版实现要求"同一轮里同时想进某个赛制的人足够多"才判为可行，
   * 结果是：想进 WSDC 的三个人里，两个把它填在第 1 志愿、一个填在第 2 志愿，
   * 他们就永远凑不到一起 —— WSDC 明明有三个人愿意去，却凑不成一支队伍。
   * 这是**实测发现的**（单元测试直接失败），不是理论担忧。
   *
   * 现在的规则是：**候选人一旦表示愿意去某个赛制，就留在那个池子里**，
   * 后面轮次里新加入的人与之合并计算。
   * 只要池子累计到 `team_size`，就确认这一批人，并记下各自是第几志愿被满足的。
   * ---------------------------------------------------------------------------
   */
  for (let rank = 0; rank < maxRounds; rank += 1) {
    // 1) 本轮把"还没被分配、且当前志愿有效"的人加入对应池子
    for (const student of orderedStudents) {
      if (assigned.has(student.studentId)) continue;
      const formatId = student.orderedFormatIds[rank];
      if (!formatId || !formatById.has(formatId)) continue;
      willingByFormat.get(formatId)?.add(student.studentId);
    }

    // 2) 池子够一支队伍的赛制：确认这一批人
    for (const format of orderedFormats) {
      const pool = willingByFormat.get(format.formatId);
      if (!pool) continue;

      /*
       * ⚠️ 必须先把"已经被分配的人"从池子里滤掉。
       *
       * 这是实测抓到的一个严重缺陷：候选人会同时留在多个赛制的池子里
       * （一个人既可以接受 PF 也可以接受 WSDC）。当 PF 先被确认、这 4 个人
       * 已经进队之后，WSDC 的池子里**仍然留着同样的 4 个 id**，
       * 于是 WSDC 也被"凑够"并把他们**又分配了一次** ——
       * 结果是 4 个学生产生 8 条参与记录，一个人同时属于两个赛制的队伍。
       *
       * 单元测试直接把它抓了出来。这里按"未分配"过滤，并把已分配者清出池子。
       */
      const members = [...pool].filter((studentId) => !assigned.has(studentId)).sort();
      pool.clear();
      for (const studentId of members) pool.add(studentId);

      if (members.length === 0) continue;
      if (members.length < format.teamSize) continue;

      for (const studentId of members) {
        const student = orderedStudents.find((entry) => entry.studentId === studentId);
        const preferenceRank = (student?.orderedFormatIds.indexOf(format.formatId) ?? 0) + 1;
        assigned.set(studentId, { formatId: format.formatId, rank: preferenceRank });
        allocations.push({ studentId, formatId: format.formatId, participationNumber: 1 });
      }
      countsByFormat[format.formatId] = (countsByFormat[format.formatId] ?? 0) + members.length;
      pool.clear();
    }
  }

  /*
   * 3) 补位：把"愿意去某个已有人的赛制"的剩余学生，用来把不完整的队伍凑齐。
   *
   * 逐个加入并实时重算缺口：只有"再加一个就凑齐一支"时才加。
   * 一次性全加进去会让多余的人落单 —— 那对目标 1（让尽可能多的人打上）没有帮助，
   * 只是把"没打上"从赛制 A 挪到赛制 B。
   */
  let progress = true;
  while (progress) {
    progress = false;
    for (const format of orderedFormats) {
      const count = countsByFormat[format.formatId] ?? 0;
      if (count === 0) continue;
      const remainder = count % format.teamSize;
      // 已经凑齐整数支队伍时不再补（补了会多出落单的人）
      if (remainder === 0) continue;

      const pool = willingByFormat.get(format.formatId);
      if (!pool || pool.size === 0) continue;

      // 取一位候选（按 id 稳定排序），加入后正好凑齐。
      // 同样要先滤掉已分配的人 —— 与上面的原因是同一个。
      const nextStudentId = [...pool].filter((id) => !assigned.has(id)).sort()[0];
      if (!nextStudentId) continue;
      pool.delete(nextStudentId);

      const student = orderedStudents.find((entry) => entry.studentId === nextStudentId);
      const preferenceRank = (student?.orderedFormatIds.indexOf(format.formatId) ?? 0) + 1;
      assigned.set(nextStudentId, { formatId: format.formatId, rank: preferenceRank });
      allocations.push({
        studentId: nextStudentId,
        formatId: format.formatId,
        participationNumber: 1,
      });
      countsByFormat[format.formatId] = count + 1;

      warnings.push({
        code: "moved_to_complete_team",
        studentId: nextStudentId,
        formatId: format.formatId,
        message:
          `为把 ${formatName(format.formatId)} 的队伍凑齐，这位学生被安排到这里补位` +
          `（他是第 ${preferenceRank} 志愿填的该赛制）。`,
      });

      progress = true;
    }
  }

  /*
   * 4) 额外场次。
   *
   * 规范第 10.2 节第 6 条："只在明确选择了额外场次时才分配额外辩论。"
   * 因此**只有** entitlementType 是 extra_* 的学生才进入这一轮。
   */
  for (const student of orderedStudents) {
    if (!isExtraEntitlement(student.entitlementType)) continue;

    const alreadyFormatId = assigned.get(student.studentId)?.formatId;
    const candidate = student.orderedFormatIds
      .filter((formatId) => formatId !== alreadyFormatId && formatById.has(formatId))
      .map((formatId) => {
        const format = formatById.get(formatId) as AllocationFormat;
        const count = countsByFormat[formatId] ?? 0;
        const remainder = count % format.teamSize;
        const gap = remainder === 0 ? format.teamSize : format.teamSize - remainder;
        return { formatId, format, gap, count };
      })
      // 只有"正好缺 1 人"才安排：否则额外场次会制造新的落单者
      .filter((entry) => entry.count > 0 && entry.gap === 1)
      .sort(
        (a, b) =>
          (formatById.get(a.formatId) as AllocationFormat).displayOrder -
            (formatById.get(b.formatId) as AllocationFormat).displayOrder ||
          a.formatId.localeCompare(b.formatId),
      )[0];

    if (!candidate) {
      warnings.push({
        code: "extra_participation_unavailable",
        studentId: student.studentId,
        message:
          "这位学生选择了额外场次，但目前没有任何赛制正好缺 1 人来凑齐完整队伍，" +
          "因此本轮的额外场次没有安排。请人工确认是否需要调整。",
      });
      continue;
    }

    countsByFormat[candidate.formatId] = candidate.count + 1;
    allocations.push({
      studentId: student.studentId,
      formatId: candidate.formatId,
      participationNumber: 2,
    });
  }

  /*
   * 5) 还没被分配的人：给出明确原因，交给管理员。
   *
   * 区分两种完全不同的原因 —— 管理员要采取的行动不一样：
   *   - 一个合格赛制都没有：要去补资格或调整活动赛制；
   *   - 有志愿但都凑不成队：要去协调人数或更换赛制。
   */
  const unallocated = orderedStudents
    .filter((student) => !assigned.has(student.studentId))
    .map((student) => {
      const reason =
        student.orderedFormatIds.length === 0
          ? "这位学生没有任何合格且已启用的赛制，无法安排。"
          : "这位学生的所有志愿都凑不成一支完整队伍，需要管理员人工处理（例如更换赛制、邀请其他学生或取消参与）。";
      warnings.push({ code: "no_viable_format", studentId: student.studentId, message: reason });
      return { studentId: student.studentId, reason };
    });

  /*
   * 5.5) 没拿到第一志愿的人，逐条说明。
   *
   * 规范第 10.2 节末句要求"每一个不明显的选择都要产生一条说明取舍的警告"。
   * "被分到了第二志愿"正是不明显的选择 —— 学生自己看结果时只会觉得奇怪，
   * 因此必须写明**为什么第一志愿没成**。
   */
  for (const student of orderedStudents) {
    const entry = assigned.get(student.studentId);
    if (!entry || entry.rank <= 1) continue;
    const firstChoice = student.orderedFormatIds[0];
    warnings.push({
      code: "preference_not_viable",
      studentId: student.studentId,
      formatId: entry.formatId,
      message:
        `第一志愿（${firstChoice ? formatName(firstChoice) : "无"}）愿意去的人不足一支队伍的人数，` +
        `凑不成一场辩论，因此这位学生被安排到第 ${entry.rank} 志愿（${formatName(entry.formatId)}）。`,
    });
  }

  // 6) 每个赛制最后报一次"人数与完整队伍的关系"，避免管理员自己算
  for (const format of orderedFormats) {
    const count = countsByFormat[format.formatId] ?? 0;
    if (count === 0) continue;
    const remainder = count % format.teamSize;
    if (count < format.teamSize) {
      warnings.push({
        code: "incomplete_team_remains",
        formatId: format.formatId,
        message: `${formatName(format.formatId)} 只有 ${count} 人，不足 ${format.teamSize} 人，凑不成一支队伍。`,
      });
    } else if (remainder !== 0) {
      warnings.push({
        code: "leftover_after_teams",
        formatId: format.formatId,
        message: `${formatName(format.formatId)} 有 ${count} 人，可以组成 ${Math.floor(count / format.teamSize)} 支完整队伍，另有 ${remainder} 人会落单。`,
      });
    }
  }

  return {
    allocations: allocations.sort(
      (a, b) =>
        a.studentId.localeCompare(b.studentId) || a.participationNumber - b.participationNumber,
    ),
    unallocated,
    warnings,
    countsByFormat,
  };
}

/**
 * 目标 1 的度量：拿到至少一次辩论的学生人数。
 *
 * 单独做成函数，便于测试直接断言"这个方案比那个方案让更多人打上球"，
 * 而不是只检查某个具体的分配结果。
 */
export function countStudentsWithADebate(result: AllocationResult): number {
  return new Set(result.allocations.map((allocation) => allocation.studentId)).size;
}
