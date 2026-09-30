import "server-only";

import { createUserSupabaseClient } from "@/lib/supabase/server";
import {
  type MatchGenerationInput,
  generateMatches,
  opponentKey,
} from "@/lib/domain/match-generation";

/**
 * 比赛的生成与持久化（Phase 5 / P5-6）。
 *
 * 把纯逻辑层（`lib/domain/match-generation.ts`）接到数据库上：
 * 读队伍与历史、调用引擎、把结果写入 `matches` 与 `match_teams`。
 *
 * 规范 10.7 第 3 条要求"重新生成必须保留已锁定/人工调整的分配" ——
 * 在比赛这一层表现为：**已经开始（名单已锁定）的比赛绝不被重新生成覆盖**。
 */

export type GenerateMatchesResult =
  | { ok: true; matchCount: number; warningCount: number; preservedMatchCount: number }
  | { ok: false; message: string };

export type PersistedMatchView = {
  matchId: string;
  matchNumber: number;
  roomName: string;
  meetingUrl: string | null;
  scheduledStart: string;
  status: string;
  ironman: boolean;
  rosterLocked: boolean;
  teams: { teamId: string; teamLabel: string | null; position: string }[];
  judges: { judgeId: string; displayName: string; role: string; status: string }[];
};

/** 读取某活动的全部比赛（供管理员界面使用）。 */
export async function listEventMatches(eventId: string): Promise<PersistedMatchView[]> {
  const supabase = await createUserSupabaseClient();

  const { data, error } = await supabase
    .from("matches")
    .select(
      "id, match_number, room_name, meeting_url, scheduled_start, status, ironman, roster_locked_at, " +
        "match_teams(team_id, position, teams(team_label)), " +
        "judge_assignments(id, judge_id, role, status, judge_profiles(profiles(display_name)))",
    )
    .eq("event_id", eventId)
    .order("match_number", { ascending: true });

  if (error) {
    console.error("[admin] 读取比赛失败:", error.message);
    return [];
  }

  type Row = {
    id: string;
    match_number: number;
    room_name: string;
    meeting_url: string | null;
    scheduled_start: string;
    status: string;
    ironman: boolean;
    roster_locked_at: string | null;
    match_teams:
      { team_id: string; position: string; teams: { team_label: string | null } | null }[] | null;
    judge_assignments:
      | {
          id: string;
          judge_id: string;
          role: string;
          status: string;
          judge_profiles: { profiles: { display_name: string } | null } | null;
        }[]
      | null;
  };

  return ((data ?? []) as unknown as Row[]).map((row) => ({
    matchId: row.id,
    matchNumber: row.match_number,
    roomName: row.room_name,
    meetingUrl: row.meeting_url,
    scheduledStart: row.scheduled_start,
    status: row.status,
    ironman: row.ironman,
    rosterLocked: row.roster_locked_at !== null,
    teams: (row.match_teams ?? [])
      .map((entry) => ({
        teamId: entry.team_id,
        teamLabel: entry.teams?.team_label ?? null,
        position: entry.position,
      }))
      .sort((a, b) => a.position.localeCompare(b.position)),
    judges: (row.judge_assignments ?? [])
      // 已取消的指派不显示（但记录保留在数据库与审计里）
      .filter((entry) => entry.status !== "cancelled")
      .map((entry) => ({
        judgeId: entry.judge_id,
        displayName: entry.judge_profiles?.profiles?.display_name ?? "（未知裁判）",
        role: entry.role,
        status: entry.status,
      })),
  }));
}

/**
 * 生成并保存比赛。
 *
 * 已开始（`roster_locked_at` 非空）的比赛**整体保留**，其队伍不参与本次重新分组。
 */
export type MatchesClient = Awaited<ReturnType<typeof createUserSupabaseClient>>;

/**
 * 生成并保存比赛。
 *
 * @param injectedClient 仅用于**集成测试**（与配对生成、裁判推荐同一做法）：
 *   server-only 模块正常路径依赖 Next 的请求上下文，无法在测试里直接调用。
 *   生产代码**不传**，权限仍由 RLS 与 Server Action 决定。
 */
export async function generateAndSaveMatches(
  eventId: string,
  injectedClient?: MatchesClient,
): Promise<GenerateMatchesResult> {
  const supabase = injectedClient ?? (await createUserSupabaseClient());

  const { data: event, error: eventError } = await supabase
    .from("events")
    .select("id, title, starts_at, match_start_at, match_interval_minutes, room_names")
    .eq("id", eventId)
    .maybeSingle();
  if (eventError) throw new Error(`读取活动失败：${eventError.message}`);
  if (!event) return { ok: false, message: "找不到这个活动。" };

  // --- 已开始的比赛：整体保留 ---
  const { data: lockedMatches, error: lockedError } = await supabase
    .from("matches")
    .select("id, match_teams(team_id)")
    .eq("event_id", eventId)
    .not("roster_locked_at", "is", null);
  if (lockedError) throw new Error(`读取已锁定比赛失败：${lockedError.message}`);

  const preservedTeamIds = new Set(
    (lockedMatches ?? []).flatMap((match) =>
      ((match.match_teams ?? []) as { team_id: string }[]).map((entry) => entry.team_id),
    ),
  );

  // --- 可用队伍 ---
  const { data: teamsData, error: teamsError } = await supabase
    .from("teams")
    .select(
      "id, format_id, average_rating, team_members(participations(student_id)), debate_formats(code, teams_per_match)",
    )
    .eq("event_id", eventId)
    .neq("status", "dissolved");
  if (teamsError) throw new Error(`读取队伍失败：${teamsError.message}`);

  type TeamRow = {
    id: string;
    format_id: string;
    average_rating: number | null;
    team_members: { participations: { student_id: string } | null }[] | null;
    debate_formats: { code: string; teams_per_match: number } | null;
  };

  const teams = ((teamsData ?? []) as unknown as TeamRow[]).filter(
    (team) => !preservedTeamIds.has(team.id) && team.debate_formats,
  );

  if (teams.length === 0) {
    return {
      ok: false,
      message:
        preservedTeamIds.size > 0
          ? "所有队伍都已经在已开始的比赛里了，没有需要重新分组的队伍。"
          : "这个活动还没有队伍。请先在配对提案里生成并确认为队伍，再生成比赛。",
    };
  }

  // --- 历史交手（避免重复对手） ---
  const { data: priorMatches, error: priorError } = await supabase
    .from("matches")
    .select("match_teams(team_id)")
    .eq("event_id", eventId)
    .not("roster_locked_at", "is", null);
  if (priorError) throw new Error(`读取历史比赛失败：${priorError.message}`);

  const previousOpponentCounts = new Map<string, number>();
  for (const match of priorMatches ?? []) {
    const ids = ((match.match_teams ?? []) as { team_id: string }[]).map((entry) => entry.team_id);
    for (let i = 0; i < ids.length; i += 1) {
      for (let j = i + 1; j < ids.length; j += 1) {
        const key = opponentKey(ids[i] as string, ids[j] as string);
        previousOpponentCounts.set(key, (previousOpponentCounts.get(key) ?? 0) + 1);
      }
    }
  }

  // --- 历史正反方（让每位学生的两侧趋于平衡） ---
  /*
   * ⚠️ `match_roster_snapshots` **没有** `event_id` 列 —— 初版这里按 event_id 过滤，
   * 数据库直接报 "column ... does not exist"。
   * 必须先在 matches 上取到该活动的比赛 id，再按 match_id 过滤。
   */
  const { data: eventMatches, error: eventMatchesError } = await supabase
    .from("matches")
    .select("id")
    .eq("event_id", eventId);
  if (eventMatchesError) throw new Error(`读取活动比赛失败：${eventMatchesError.message}`);

  const eventMatchIds = (eventMatches ?? []).map((match) => match.id as string);
  const { data: sideHistory, error: sideError } =
    eventMatchIds.length === 0
      ? { data: [] as { student_id: string; position: string }[], error: null }
      : await supabase
          .from("match_roster_snapshots")
          .select("student_id, position")
          .in("match_id", eventMatchIds);
  if (sideError) throw new Error(`读取历史正反方失败：${sideError.message}`);

  /*
   * 逐人统计两侧出场次数。
   *
   * 初版这里写过一个**伪造的键**去数"打了几场"，那是错的：
   * `match_roster_snapshots` 没有 `match_id` 之外可用的分组信息，
   * 而用 `student_id|position` 当键既不是场次也不是人数。
   * 现在直接按位置归类：第一侧（PROP/OG/OO）与第二侧（OPP/CG/CO）各记各的。
   */
  const SIDE_A_POSITIONS = new Set(["PROP", "OG", "OO"]);
  const previousSideACounts = new Map<string, number>();
  const previousSideBCounts = new Map<string, number>();

  for (const row of sideHistory ?? []) {
    const target = SIDE_A_POSITIONS.has(row.position) ? previousSideACounts : previousSideBCounts;
    target.set(row.student_id, (target.get(row.student_id) ?? 0) + 1);
  }

  /*
   * 按赛制分别生成。规范第 15 节要求"分赛制操作页"，
   * 而不同赛制的 `teams_per_match` 与位置集合都不同，混在一起算没有意义。
   */
  const byFormat = new Map<string, TeamRow[]>();
  for (const team of teams) {
    const list = byFormat.get(team.format_id) ?? [];
    list.push(team);
    byFormat.set(team.format_id, list);
  }

  const allWarnings: string[] = [];
  let createdMatchCount = 0;
  let nextMatchNumber = 1;

  for (const [formatId, formatTeams] of [...byFormat.entries()].sort((a, b) =>
    a[0].localeCompare(b[0]),
  )) {
    const formatConfig = formatTeams[0]?.debate_formats;
    if (!formatConfig) continue;

    // 每个赛制的场次编号从**该赛制已有比赛的最大编号 + 1** 开始
    const { data: existingNumbers } = await supabase
      .from("matches")
      .select("match_number")
      .eq("event_id", eventId)
      .eq("format_id", formatId)
      .order("match_number", { ascending: false })
      .limit(1);
    nextMatchNumber = ((existingNumbers?.[0]?.match_number as number | undefined) ?? 0) + 1;

    const { data: existingRooms } = await supabase
      .from("matches")
      .select("room_name")
      .eq("event_id", eventId);
    const usedRooms = new Set((existingRooms ?? []).map((row) => row.room_name as string));

    /*
     * 房间池。
     *
     * 优先用**活动配置里的房间名**（`events.room_names`）——
     * 那是产品负责人明确要求"能自己设置"的那一项。
     * 配置为空时退回原来的默认（A101 起），保持旧行为不变。
     *
     * 两种情况都要跳过**本活动已经用掉**的房间名：
     * `matches` 上有 `UNIQUE (event_id, room_name)`，重复会直接违反约束。
     */
    const configuredRooms = ((event.room_names as string[] | null) ?? []).filter(
      (name) => name.trim() !== "" && !usedRooms.has(name),
    );

    const roomNames: string[] = [...configuredRooms];
    if (roomNames.length === 0) {
      for (let index = 1; roomNames.length < 50; index += 1) {
        const candidate = `A${100 + index}`;
        if (!usedRooms.has(candidate)) roomNames.push(candidate);
      }
    }

    const input: MatchGenerationInput = {
      eventId,
      format: {
        formatId,
        code: formatConfig.code,
        teamsPerMatch: formatConfig.teams_per_match,
      },
      teams: formatTeams.map((team) => ({
        teamId: team.id,
        averageRating: team.average_rating ?? 5,
        memberStudentIds: (team.team_members ?? [])
          .map((member) => member.participations?.student_id)
          .filter((value): value is string => Boolean(value)),
      })),
      previousOpponentCounts,
      previousSideACounts,
      previousSideBCounts,
      roomNames,
      /*
       * 开始时间与间隔也改成读活动配置。
       *
       * 默认保持旧行为：`match_start_at` 为空时用活动开始时间；
       * 若活动开始时间也没有（理论上不可能，它是 NOT NULL），退回"三天后"。
       * 间隔默认 60 分钟。
       */
      firstMatchStart: event.match_start_at
        ? new Date(event.match_start_at as string)
        : new Date(event.starts_at as string),
      matchIntervalMinutes: (event.match_interval_minutes as number | null) ?? 60,
    };

    const result = generateMatches(input);
    for (const warning of result.warnings)
      allWarnings.push(`[${formatConfig.code}] ${warning.message}`);

    if (result.matches.length === 0) continue;

    // --- 落库 ---
    const { data: inserted, error: insertError } = await supabase
      .from("matches")
      .insert(
        result.matches.map((match, index) => ({
          event_id: eventId,
          format_id: formatId,
          match_number: nextMatchNumber + index,
          room_name: match.roomName,
          scheduled_start: match.scheduledStart,
          status: "scheduled" as const,
        })),
      )
      .select("id");
    if (insertError || !inserted) {
      throw new Error(`写入比赛失败：${insertError?.message ?? "未知错误"}`);
    }

    const matchTeamRows = inserted.flatMap((row, index) =>
      (result.matches[index]?.teams ?? []).map((team) => ({
        match_id: row.id as string,
        team_id: team.teamId,
        position: team.position,
      })),
    );
    if (matchTeamRows.length > 0) {
      const { error: teamLinkError } = await supabase.from("match_teams").insert(matchTeamRows);
      if (teamLinkError) throw new Error(`写入比赛队伍失败：${teamLinkError.message}`);
    }

    createdMatchCount += result.matches.length;
  }

  return {
    ok: true,
    matchCount: createdMatchCount,
    warningCount: allWarnings.length,
    preservedMatchCount: lockedMatches?.length ?? 0,
  };
}
