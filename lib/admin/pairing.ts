import "server-only";

import { createUserSupabaseClient } from "@/lib/supabase/server";
import { PAIRING_ALGORITHM_VERSION } from "@/lib/domain/pairing-cost";
import {
  type AllocationFormat,
  type AllocationStudent,
  allocateParticipations,
} from "@/lib/domain/participation-allocation";
import {
  type TeamCandidate,
  type TeamFormationWarning,
  formTeams,
} from "@/lib/domain/team-formation";

/**
 * 配对提案的生成与持久化（Phase 4 / P4-5）。
 *
 * 本模块把纯逻辑层（分配 + 队伍生成）接到数据库上，并把规范要求的
 * **提案输入、评分、警告与算法版本**存下来。
 *
 * 规范第 10.7 节第 3 条要求"重新生成必须保留已锁定/人工调整的分配"。
 * 实现方式：生成前先把已锁定/人工调整的队伍**整体保留**，
 * 并把它们的成员从本次参与生成的学生里排除出去 —— 这样重新生成
 * 不会把管理员手工排好的队伍冲掉。
 */

/**
 * 查询失败时立刻抛出，而不是让 `data` 变成 null 继续往下走。
 *
 * 为什么专门加这个：**最初这一版把每个查询的错误都忽略了**。
 * 结果是一次外键失败表现为"生成出 0 支队伍"，排查方向被完全带偏 ——
 * 看起来像算法问题，实际是数据没写进去。
 * 数据库查询失败必须**立刻**暴露，不能静默降级成"没有数据"。
 */
function unwrap<T>(result: { data: T; error: { message: string } | null }, what: string): T {
  if (result.error) {
    throw new Error(`读取${what}失败：${result.error.message}`);
  }
  return result.data;
}

export type GenerationResult =
  | {
      ok: true;
      proposalId: string;
      teamCount: number;
      warningCount: number;
      preservedTeamCount: number;
    }
  | { ok: false; message: string };

type ParticipationRow = {
  id: string;
  student_id: string;
  format_id: string;
  rating_snapshot: number;
  participation_number: number;
  entitlement_type: string;
  status: string;
};

/** 已锁定/人工调整、必须在重新生成时保留的队伍。 */
type PreservedTeam = {
  id: string;
  format_id: string;
  memberParticipationIds: string[];
  memberStudentIds: string[];
};

/**
 * 数据库客户端的类型。
 *
 * 用"用户身份客户端"的返回类型表述：管理员用的服务角色客户端与它结构相同，
 * 因此可以注入进来（见下面的说明）。
 */
export type PairingClient = Awaited<ReturnType<typeof createUserSupabaseClient>>;

/**
 * 生成并保存配对提案。
 *
 * @param eventId 活动
 * @param injectedClient 仅用于**集成测试**：允许注入一个服务角色客户端。
 *
 * 为什么要留这个参数：本模块是 server-only 的，正常路径下依赖 Next 的请求上下文
 * （cookies）来构造用户身份客户端，因此**无法在测试里直接调用**。
 * 为了让"这一段数据库读写到底对不对"能被真实验证（而不是只靠类型检查），
 * 允许测试注入一个客户端。
 *
 * 安全性说明：这不构成绕过权限的入口 —— 生产代码**不传**这个参数，
 * 走的是用户身份客户端，权限仍由 RLS 与 Server Action 的检查决定。
 * 集成测试用的是服务角色，因此那一条测试**不覆盖 RLS**；
 * RLS 由 `scripts/db-tests.sql` 单独覆盖。
 */
export async function generatePairingProposal(
  eventId: string,
  injectedClient?: PairingClient,
): Promise<GenerationResult> {
  const supabase = injectedClient ?? (await createUserSupabaseClient());

  // ---------------------------------------------------------------------------
  // 1) 载入事件与赛制配置
  // ---------------------------------------------------------------------------
  const [eventResult, eventFormatsResult] = await Promise.all([
    supabase.from("events").select("id, title, status").eq("id", eventId).maybeSingle(),
    supabase
      .from("event_formats")
      .select("format_id, debate_formats(code, name, team_size, teams_per_match, display_order)")
      .eq("event_id", eventId)
      .eq("enabled", true),
  ]);

  const event = unwrap(eventResult, "活动");
  const eventFormats = unwrap(eventFormatsResult, "活动赛制");

  if (!event) return { ok: false, message: "找不到这个活动。" };

  type EventFormatRow = {
    format_id: string;
    debate_formats: {
      code: string;
      name: string;
      team_size: number;
      teams_per_match: number;
      display_order: number;
    } | null;
  };

  const formats: (AllocationFormat & { teamsPerMatch: number; name: string })[] = (
    (eventFormats ?? []) as unknown as EventFormatRow[]
  )
    .filter((row) => row.debate_formats)
    .map((row) => ({
      formatId: row.format_id,
      code: row.debate_formats?.code ?? "?",
      name: row.debate_formats?.name ?? "（未知赛制）",
      teamSize: row.debate_formats?.team_size ?? 2,
      teamsPerMatch: row.debate_formats?.teams_per_match ?? 2,
      displayOrder: row.debate_formats?.display_order ?? 0,
    }));

  if (formats.length === 0) {
    return { ok: false, message: "这个活动还没有启用任何赛制，无法生成配对提案。" };
  }

  // ---------------------------------------------------------------------------
  // 2) 载入当前参与、报名与偏好
  // ---------------------------------------------------------------------------
  const participationsRaw = unwrap(
    await supabase
      .from("participations")
      .select(
        "id, student_id, format_id, rating_snapshot, participation_number, entitlement_type, status",
      )
      .eq("event_id", eventId)
      .in("status", ["proposed", "confirmed"]),
    "参与记录",
  );

  const participations = (participationsRaw ?? []) as ParticipationRow[];
  if (participations.length === 0) {
    return {
      ok: false,
      message: "这个活动还没有任何参与记录。请先完成报名，再生成配对提案。",
    };
  }

  const studentIds = [...new Set(participations.map((row) => row.student_id))];

  const [registrationsResult, eligibilityResult, partnerRequestsResult] = await Promise.all([
    supabase.from("registrations").select("student_id, status").eq("event_id", eventId),
    supabase
      .from("student_format_profiles")
      .select("student_id, format_id, eligible")
      .in("student_id", studentIds),
    supabase
      .from("partner_requests")
      .select("requester_student_id, requested_student_id")
      .eq("event_id", eventId)
      .eq("status", "accepted"),
  ]);

  const registrations = unwrap(registrationsResult, "报名");
  const eligibility = unwrap(eligibilityResult, "赛制资格");
  const partnerRequests = unwrap(partnerRequestsResult, "搭档请求");

  const availableStudentIds = new Set(
    (registrations ?? [])
      .filter((row) => row.status === "registered" || row.status === "checked_in")
      .map((row) => row.student_id as string),
  );

  const eligiblePairs = new Set(
    (eligibility ?? [])
      .filter((row) => row.eligible)
      .map((row) => `${row.student_id}|${row.format_id}`),
  );

  /*
   * 已接受的搭档。必须**双方都出现**才算 ——
   * 数据库里一条 partner_requests 记录就代表双方已达成一致（status = accepted），
   * 因此这里把这个关系同时记到两个人身上。
   */
  const acceptedPartners = new Map<string, Set<string>>();
  for (const request of partnerRequests ?? []) {
    const a = request.requester_student_id as string;
    const b = request.requested_student_id as string;
    if (!acceptedPartners.has(a)) acceptedPartners.set(a, new Set());
    if (!acceptedPartners.has(b)) acceptedPartners.set(b, new Set());
    acceptedPartners.get(a)?.add(b);
    acceptedPartners.get(b)?.add(a);
  }

  /*
   * 以前做过队友的人（跨活动）。
   *
   * 规范说重复队友只是**轻惩罚**（稳定搭档是被允许的），因此这里只是"知道"，
   * 不用来阻止组队。
   */
  const previousMemberships = unwrap(
    await supabase
      .from("team_members")
      .select("team_id, teams!inner(event_id), participations!inner(student_id)")
      .in("participations.student_id", studentIds),
    "历史队友",
  );

  type PreviousMembershipRow = {
    team_id: string;
    teams: { event_id: string } | null;
    participations: { student_id: string } | null;
  };

  const studentsByTeam = new Map<string, Set<string>>();
  for (const row of (previousMemberships ?? []) as unknown as PreviousMembershipRow[]) {
    // 同一活动内的队伍不算"以前"队友（那就是本提案自己）
    if (row.teams?.event_id === eventId) continue;
    const studentId = row.participations?.student_id;
    if (!studentId) continue;
    if (!studentsByTeam.has(row.team_id)) studentsByTeam.set(row.team_id, new Set());
    studentsByTeam.get(row.team_id)?.add(studentId);
  }

  const previousTeammates = new Map<string, Set<string>>();
  for (const members of studentsByTeam.values()) {
    for (const member of members) {
      if (!previousTeammates.has(member)) previousTeammates.set(member, new Set());
      for (const other of members) {
        if (other !== member) previousTeammates.get(member)?.add(other);
      }
    }
  }

  // ---------------------------------------------------------------------------
  // 3) 保留已锁定 / 人工调整的队伍（规范 10.7 第 3 条）
  // ---------------------------------------------------------------------------
  const preservedRaw = unwrap(
    await supabase
      .from("teams")
      .select("id, format_id, team_members(participation_id, participations(student_id))")
      .eq("event_id", eventId)
      .or("locked.eq.true,manually_edited.eq.true"),
    "已锁定的队伍",
  );

  type PreservedRow = {
    id: string;
    format_id: string;
    team_members:
      { participation_id: string; participations: { student_id: string } | null }[] | null;
  };

  const preservedTeams: PreservedTeam[] = ((preservedRaw ?? []) as unknown as PreservedRow[]).map(
    (row) => ({
      id: row.id,
      format_id: row.format_id,
      memberParticipationIds: (row.team_members ?? []).map((member) => member.participation_id),
      memberStudentIds: (row.team_members ?? [])
        .map((member) => member.participations?.student_id)
        .filter((value): value is string => Boolean(value)),
    }),
  );

  const preservedStudentIds = new Set(preservedTeams.flatMap((team) => team.memberStudentIds));

  /*
   * 学生 -> 他"最想去的赛制顺序"。
   *
   * 从 registration_format_preferences 读取，按 preference_rank 排序。
   * 没有填偏好的人得到一个空数组 —— 分配引擎会把他列为"需要管理员处理"，
   * 而不是替他随便选一个赛制。
   */
  const preferences = unwrap(
    await supabase
      .from("registration_format_preferences")
      .select(
        "registration_id, format_id, preference_rank, registrations!inner(event_id, student_id)",
      )
      .eq("registrations.event_id", eventId)
      .order("preference_rank", { ascending: true }),
    "赛制偏好",
  );

  type PreferenceRow = {
    format_id: string;
    preference_rank: number;
    registrations: { student_id: string } | null;
  };

  const preferencesByStudent = new Map<string, string[]>();
  for (const row of (preferences ?? []) as unknown as PreferenceRow[]) {
    const studentId = row.registrations?.student_id;
    if (!studentId) continue;
    const list = preferencesByStudent.get(studentId) ?? [];
    list.push(row.format_id);
    preferencesByStudent.set(studentId, list);
  }

  const enabledFormatIds = new Set(formats.map((format) => format.formatId));

  // ---------------------------------------------------------------------------
  // 4) 分配参与
  // ---------------------------------------------------------------------------
  const allocationStudents: AllocationStudent[] = studentIds
    .filter((studentId) => !preservedStudentIds.has(studentId))
    .map((studentId) => {
      // 只保留"该学生合格、且本活动已启用"的赛制，并维持偏好顺序
      const orderedFormatIds = (preferencesByStudent.get(studentId) ?? []).filter(
        (formatId) =>
          enabledFormatIds.has(formatId) && eligiblePairs.has(`${studentId}|${formatId}`),
      );

      // 名额类型取该学生的第一条参与（正常名额通常只有一条）
      const first = participations.find((row) => row.student_id === studentId);

      return {
        studentId,
        orderedFormatIds,
        entitlementType: (first?.entitlement_type ??
          "weekly_entitlement") as AllocationStudent["entitlementType"],
      };
    });

  const allocation = allocateParticipations(allocationStudents, formats);

  // ---------------------------------------------------------------------------
  // 5) 每个赛制生成队伍
  // ---------------------------------------------------------------------------
  type FormedTeamWithFormat = {
    formatId: string;
    team: ReturnType<typeof formTeams>["teams"][number];
  };

  const formedTeams: FormedTeamWithFormat[] = [];
  const teamWarnings: (TeamFormationWarning & { formatId: string; formatCode: string })[] = [];

  for (const format of formats) {
    const allocatedStudents = allocation.allocations
      .filter((entry) => entry.formatId === format.formatId)
      .map((entry) => entry.studentId);

    if (allocatedStudents.length === 0) continue;

    const candidates: TeamCandidate[] = allocatedStudents.map((studentId) => ({
      studentId,
      rating: participations.find((row) => row.student_id === studentId)?.rating_snapshot ?? 5,
      eligible: eligiblePairs.has(`${studentId}|${format.formatId}`),
      available: availableStudentIds.has(studentId),
      acceptedPartnerStudentIds: [...(acceptedPartners.get(studentId) ?? [])].filter((partnerId) =>
        allocatedStudents.includes(partnerId),
      ),
      previousTeammateStudentIds: [...(previousTeammates.get(studentId) ?? [])],
    }));

    const result = formTeams(candidates, format);
    for (const team of result.teams) formedTeams.push({ formatId: format.formatId, team });
    for (const warning of result.warnings) {
      teamWarnings.push({ formatId: format.formatId, formatCode: format.code, ...warning });
    }
  }

  // ---------------------------------------------------------------------------
  // 6) 落库
  // ---------------------------------------------------------------------------
  const warnings = [
    ...allocation.warnings.map((warning) => ({ ...warning, source: "allocation" as const })),
    ...teamWarnings,
  ];

  const { data: proposal, error: proposalError } = await supabase
    .from("pairing_proposals")
    .insert({
      event_id: eventId,
      algorithm_version: PAIRING_ALGORITHM_VERSION,
      input_snapshot: {
        formats: formats.map((format) => ({
          formatId: format.formatId,
          code: format.code,
          teamSize: format.teamSize,
          teamsPerMatch: format.teamsPerMatch,
        })),
        students: allocationStudents.map((student) => ({
          studentId: student.studentId,
          preferences: [...student.orderedFormatIds],
          entitlementType: student.entitlementType,
          rating:
            participations.find((row) => row.student_id === student.studentId)?.rating_snapshot ??
            null,
          eligible: true,
          available: availableStudentIds.has(student.studentId),
          acceptedPartners: [...(acceptedPartners.get(student.studentId) ?? [])],
          previousTeammates: [...(previousTeammates.get(student.studentId) ?? [])],
        })),
        preservedTeamIds: preservedTeams.map((team) => team.id),
      },
      warnings,
      summary: {
        allocationCounts: allocation.countsByFormat,
        unallocatedCount: allocation.unallocated.length,
        teamCount: formedTeams.length,
        totalCost: formedTeams.reduce((sum, entry) => sum + entry.team.cost, 0),
        preservedTeamCount: preservedTeams.length,
      },
    })
    .select("id")
    .single();

  if (proposalError || !proposal) {
    console.error("[admin] 保存配对提案失败:", proposalError?.message);
    return { ok: false, message: "保存配对提案失败，请稍后再试。" };
  }

  /*
   * 删除**本次生成会产生**的旧队伍（proposed 且未锁定、未人工调整），
   * 然后写入新队伍。已锁定/人工调整的队伍在上面已经整体保留，不会被删。
   *
   * 先删 team_members 再删 teams：team_members 有外键指回 teams。
   */
  const { data: staleTeams } = await supabase
    .from("teams")
    .select("id")
    .eq("event_id", eventId)
    .eq("status", "proposed")
    .eq("locked", false)
    .eq("manually_edited", false);

  const staleTeamIds = (staleTeams ?? []).map((row) => row.id as string);
  if (staleTeamIds.length > 0) {
    await supabase.from("team_members").delete().in("team_id", staleTeamIds);
    await supabase.from("teams").delete().in("id", staleTeamIds);
  }

  if (formedTeams.length > 0) {
    /*
     * 队伍编号（例如 PF-1、PF-2）按赛制分别从 1 开始。
     * 用一个计数器算，而不是在 map 里回头过滤再 indexOf ——
     * 后者是 O(n²)，而且依赖对象引用相等，很容易在后续重构中悄悄算错。
     */
    const labelCounters = new Map<string, number>();

    const { data: insertedTeams, error: teamError } = await supabase
      .from("teams")
      .insert(
        formedTeams.map((entry) => {
          const format = formats.find((item) => item.formatId === entry.formatId);
          const ordinal = (labelCounters.get(entry.formatId) ?? 0) + 1;
          labelCounters.set(entry.formatId, ordinal);
          return {
            event_id: eventId,
            format_id: entry.formatId,
            status: "proposed" as const,
            average_rating: entry.team.averageRating,
            proposal_id: proposal.id,
            team_label: format ? `${format.code}-${ordinal}` : null,
          };
        }),
      )
      .select("id");

    if (teamError || !insertedTeams) {
      console.error("[admin] 写入队伍失败:", teamError?.message);
      return { ok: false, message: "提案已保存，但写入队伍失败，请重试。" };
    }

    // 参与 id 映射：一次性查出来，避免逐条查询
    const { data: participationRows } = await supabase
      .from("participations")
      .select("id, student_id")
      .eq("event_id", eventId);

    const participationByStudent = new Map(
      (participationRows ?? []).map((row) => [row.student_id as string, row.id as string] as const),
    );

    const memberRows = insertedTeams.flatMap((inserted, index) =>
      (formedTeams[index]?.team.memberStudentIds ?? [])
        .map((studentId, position) => {
          const participationId = participationByStudent.get(studentId);
          if (!participationId) return null;
          return {
            team_id: inserted.id as string,
            participation_id: participationId,
            speaker_position: position + 1,
            is_ironman: false,
          };
        })
        .filter((row): row is NonNullable<typeof row> => row !== null),
    );

    if (memberRows.length > 0) {
      const { error: memberError } = await supabase.from("team_members").insert(memberRows);
      if (memberError) {
        console.error("[admin] 写入队伍成员失败:", memberError.message);
        return { ok: false, message: "提案已保存，但写入队伍成员失败，请重试。" };
      }
    }
  }

  return {
    ok: true,
    proposalId: proposal.id as string,
    teamCount: formedTeams.length,
    warningCount: warnings.length,
    preservedTeamCount: preservedTeams.length,
  };
}
