import "server-only";

import { createUserSupabaseClient } from "@/lib/supabase/server";
import {
  type JudgeCostComponents,
  type JudgeEligibilityFacts,
  checkJudgeEligibility,
  computeJudgeCost,
  explainJudgeCost,
} from "@/lib/domain/judge-cost";

/**
 * 裁判候选推荐与指派（Phase 5 / P5-4，规范第 11 节）。
 *
 * 规范要求的顺序是：
 *   1. 先按**硬性资格**筛掉不合格的人（已批准、活动可用、赛制有资格、
 *      现场指派时已签到、无时间冲突）；
 *   2. 再按 `judge_cost` 给剩下的人排序（10/6/3 三个权重，见 `lib/domain/judge-cost.ts`）；
 *   3. 推荐界面展示**资格、重复执裁次数、工作量与警告**，由管理员确认。
 *
 * ⚠️ 规范明文限定 V1 **只有"重复执裁"一条回避规则**，并禁止在未获产品负责人
 * 确认时自行增加同校/教练等回避。因此本文件不会引入任何其他回避规则。
 */

export type JudgeCandidateView = {
  judgeId: string;
  displayName: string;
  /** 硬性资格是否全部满足 */
  eligible: boolean;
  /** 不满足的原因（中文，可直接显示） */
  ineligibilityReasons: string[];
  /** 供界面展示的四项事实 */
  facts: JudgeEligibilityFacts;
  cost: number;
  costBreakdown: ReturnType<typeof explainJudgeCost>;
  components: JudgeCostComponents;
};

export type JudgeRecommendation = {
  matchId: string;
  matchNumber: number;
  roomName: string;
  formatCode: string;
  /** 按成本从低到高排序；不合格的人排在最后 */
  candidates: JudgeCandidateView[];
  /** 当前已指派的裁判（如果有） */
  assignedJudgeIds: string[];
  /** 需要管理员注意的说明 */
  warnings: string[];
};

type MatchRow = {
  id: string;
  match_number: number;
  room_name: string;
  scheduled_start: string;
  status: string;
  format_id: string;
  debate_formats: { code: string } | null;
};

/**
 * 某场比赛的正选学生（用于统计"这位裁判执裁过本场学生多少次"）。
 *
 * 走 `match_teams → teams → team_members → participations`。
 * 注意：**不能**用 `match_roster_snapshots` —— 那是比赛**开始之后**才有的，
 * 而指派通常在开始之前进行，那时快照还是空的。
 */
async function studentsInMatch(
  supabase: Awaited<ReturnType<typeof createUserSupabaseClient>>,
  matchId: string,
): Promise<string[]> {
  const { data, error } = await supabase
    .from("match_teams")
    .select("teams(team_members(participations(student_id)))")
    .eq("match_id", matchId);

  if (error) throw new Error(`读取本场学生失败：${error.message}`);

  type Row = {
    teams: { team_members: { participations: { student_id: string } | null }[] | null } | null;
  };

  const studentIds = new Set<string>();
  for (const row of (data ?? []) as unknown as Row[]) {
    for (const member of row.teams?.team_members ?? []) {
      const studentId = member.participations?.student_id;
      if (studentId) studentIds.add(studentId);
    }
  }
  return [...studentIds];
}

/**
 * 推荐某场比赛的裁判候选。
 *
 * @param liveAssignment 是否属于"现场指派"（规范要求现场指派时裁判必须已签到）
 */
export type JudgeAssignmentClient = Awaited<ReturnType<typeof createUserSupabaseClient>>;

export async function recommendJudgesForMatch(
  matchId: string,
  options: { liveAssignment?: boolean; injectedClient?: JudgeAssignmentClient } = {},
): Promise<JudgeRecommendation | null> {
  /*
   * 与配对生成（P4-6）同一做法：允许**集成测试**注入一个客户端。
   *
   * 本模块是 server-only 的，正常路径依赖 Next 的请求上下文（cookies），
   * 因此无法在测试里直接调用 —— 而不验证就等于只有类型检查在保护它。
   * 生产代码**不传**这个参数，权限仍由 RLS 与 Server Action 决定。
   */
  const supabase = options.injectedClient ?? (await createUserSupabaseClient());
  const liveAssignment = options.liveAssignment ?? false;

  // ---------------------------------------------------------------------------
  // 1) 本场比赛
  // ---------------------------------------------------------------------------
  const { data: matchData, error: matchError } = await supabase
    .from("matches")
    .select("id, match_number, room_name, scheduled_start, status, format_id, debate_formats(code)")
    .eq("id", matchId)
    .maybeSingle();

  if (matchError) throw new Error(`读取比赛失败：${matchError.message}`);
  if (!matchData) return null;

  const match = matchData as unknown as MatchRow;
  const formatCode = match.debate_formats?.code ?? "?";

  const matchStudentIds = await studentsInMatch(supabase, matchId);

  // ---------------------------------------------------------------------------
  // 2) 候选范围：本活动上登记过可用性的裁判
  // ---------------------------------------------------------------------------
  const { data: availability, error: availabilityError } = await supabase
    .from("judge_event_availability")
    .select("judge_id, status, checked_in_at")
    .eq("event_id", (await eventIdOfMatch(supabase, matchId)) ?? "");

  if (availabilityError) throw new Error(`读取裁判可用性失败：${availabilityError.message}`);

  const judgeIds = (availability ?? []).map((row) => row.judge_id as string);
  if (judgeIds.length === 0) {
    return {
      matchId: match.id,
      matchNumber: match.match_number,
      roomName: match.room_name,
      formatCode,
      candidates: [],
      assignedJudgeIds: [],
      warnings: ["这个活动还没有裁判登记可用性，因此没有可推荐的裁判。"],
    };
  }

  const availabilityByJudge = new Map(
    (availability ?? []).map((row) => [
      row.judge_id as string,
      { status: row.status as string, checkedInAt: row.checked_in_at as string | null },
    ]),
  );

  // ---------------------------------------------------------------------------
  // 3) 裁判档案、资格、已有指派
  // ---------------------------------------------------------------------------
  const [
    { data: judgeProfiles, error: profileError },
    { data: qualifications },
    { data: existing },
  ] = await Promise.all([
    supabase
      .from("judge_profiles")
      .select("id, profile_id, approval_status, profiles(display_name)")
      .in("id", judgeIds),
    supabase
      .from("judge_format_qualifications")
      .select("judge_id, format_id")
      .eq("format_id", match.format_id),
    supabase
      .from("judge_assignments")
      .select("judge_id, match_id, status, matches(scheduled_start, event_id)")
      .in("judge_id", judgeIds),
  ]);

  if (profileError) throw new Error(`读取裁判档案失败：${profileError.message}`);

  type JudgeProfileRow = {
    id: string;
    profile_id: string;
    approval_status: string;
    profiles: { display_name: string } | null;
  };

  const qualifiedJudgeIds = new Set((qualifications ?? []).map((row) => row.judge_id as string));

  type AssignmentRow = {
    judge_id: string;
    match_id: string;
    status: string;
    matches: { scheduled_start: string; event_id: string } | null;
  };

  const assignments = (existing ?? []) as unknown as AssignmentRow[];

  const workloadByJudge = new Map<string, number>();
  const overlappingJudgeIds = new Set<string>();
  /** 同一活动内的指派（"近期"的定义见下） */
  const recentMatchIdsByJudge = new Map<string, Set<string>>();

  const eventId = await eventIdOfMatch(supabase, matchId);

  for (const assignment of assignments) {
    if (assignment.status === "cancelled") continue;
    workloadByJudge.set(assignment.judge_id, (workloadByJudge.get(assignment.judge_id) ?? 0) + 1);

    if (
      assignment.matches?.scheduled_start === match.scheduled_start &&
      assignment.match_id !== matchId
    ) {
      overlappingJudgeIds.add(assignment.judge_id);
    }

    if (eventId && assignment.matches?.event_id === eventId) {
      const set = recentMatchIdsByJudge.get(assignment.judge_id) ?? new Set<string>();
      set.add(assignment.match_id);
      recentMatchIdsByJudge.set(assignment.judge_id, set);
    }
  }

  /*
   * "近期执裁过本场学生"的定义。
   *
   * 规范给了 `recent_times_judged_any_student_in_match` 这一项，但**没有定义"近期"**。
   * 这里明确采用：**同一个活动之内**的执裁记录算"近期" ——
   * 也就是说"这位裁判在这次活动的前几轮已经看过这些学生"，
   * 这正是"重复暴露"最直接的含义，而且不需要引入一个任意的天数阈值。
   *
   * （不采用"最近 N 天"是因为 N 的取值会变成另一个我无权决定的产品参数。）
   */
  const { data: history } = await supabase
    .from("judge_assignments")
    .select(
      "judge_id, match_id, status, matches(event_id, match_teams(teams(team_members(participations(student_id)))))",
    )
    .in("judge_id", judgeIds)
    .neq("status", "cancelled");

  type HistoryRow = {
    judge_id: string;
    match_id: string;
    matches: {
      event_id: string;
      match_teams:
        | {
            teams: {
              team_members: { participations: { student_id: string } | null }[] | null;
            } | null;
          }[]
        | null;
    } | null;
  };

  const totalExposureByJudge = new Map<string, number>();
  const recentExposureByJudge = new Map<string, number>();

  for (const row of (history ?? []) as unknown as HistoryRow[]) {
    const judgedStudentIds = new Set<string>();
    for (const matchTeam of row.matches?.match_teams ?? []) {
      for (const member of matchTeam.teams?.team_members ?? []) {
        const studentId = member.participations?.student_id;
        if (studentId) judgedStudentIds.add(studentId);
      }
    }

    // 与**本场**学生有交集的次数
    const overlap = matchStudentIds.filter((studentId) => judgedStudentIds.has(studentId)).length;
    if (overlap === 0) continue;

    // 同一次执裁里，无论覆盖几位本场学生，都只算"一次执裁"——
    // 规范说的是 "times judged any student"，即以"场"为单位
    totalExposureByJudge.set(row.judge_id, (totalExposureByJudge.get(row.judge_id) ?? 0) + 1);

    if (eventId && row.matches?.event_id === eventId) {
      recentExposureByJudge.set(row.judge_id, (recentExposureByJudge.get(row.judge_id) ?? 0) + 1);
    }
  }

  // ---------------------------------------------------------------------------
  // 4) 组装候选：先判资格，再算成本
  // ---------------------------------------------------------------------------
  const candidates: JudgeCandidateView[] = (
    (judgeProfiles ?? []) as unknown as JudgeProfileRow[]
  ).map((judge) => {
    const availabilityEntry = availabilityByJudge.get(judge.id);
    const facts: JudgeEligibilityFacts = {
      approved: judge.approval_status === "approved",
      availableForEvent:
        availabilityEntry?.status === "approved" || availabilityEntry?.status === "assigned",
      qualifiedForFormat: qualifiedJudgeIds.has(judge.id),
      liveAssignmentRequiresCheckIn: liveAssignment,
      checkedIn: Boolean(availabilityEntry?.checkedInAt),
      hasOverlappingAssignment: overlappingJudgeIds.has(judge.id),
    };

    const eligibility = checkJudgeEligibility(facts);

    const components: JudgeCostComponents = {
      totalTimesJudgedAnyStudentInMatch: totalExposureByJudge.get(judge.id) ?? 0,
      recentTimesJudgedAnyStudentInMatch: recentExposureByJudge.get(judge.id) ?? 0,
      workloadCountForEvent: workloadByJudge.get(judge.id) ?? 0,
    };

    return {
      judgeId: judge.id,
      displayName: judge.profiles?.display_name ?? "（未知裁判）",
      eligible: eligibility.eligible,
      ineligibilityReasons: eligibility.reasons,
      facts,
      cost: computeJudgeCost(components),
      costBreakdown: explainJudgeCost(components),
      components,
    };
  });

  // 合格者按成本升序，并列按裁判 id 稳定排序；不合格者一律排在最后
  candidates.sort((a, b) => {
    if (a.eligible !== b.eligible) return a.eligible ? -1 : 1;
    if (a.cost !== b.cost) return a.cost - b.cost;
    return a.judgeId.localeCompare(b.judgeId);
  });

  const warnings: string[] = [];
  if (matchStudentIds.length === 0) {
    warnings.push(
      "这场比赛还没有分配队伍，因此无法统计「裁判是否执裁过本场学生」。请先完成比赛名单。",
    );
  }
  if (!candidates.some((candidate) => candidate.eligible)) {
    warnings.push(
      "目前没有任何裁判满足全部资格条件。常见原因：尚未审批、没有该赛制资格、或时间冲突。",
    );
  }

  return {
    matchId: match.id,
    matchNumber: match.match_number,
    roomName: match.room_name,
    formatCode,
    candidates,
    assignedJudgeIds: assignments
      .filter((assignment) => assignment.match_id === matchId && assignment.status !== "cancelled")
      .map((assignment) => assignment.judge_id),
    warnings,
  };
}

async function eventIdOfMatch(
  supabase: Awaited<ReturnType<typeof createUserSupabaseClient>>,
  matchId: string,
): Promise<string | null> {
  const { data } = await supabase
    .from("matches")
    .select("event_id")
    .eq("id", matchId)
    .maybeSingle();
  return (data?.event_id as string | undefined) ?? null;
}
