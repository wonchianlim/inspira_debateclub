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
export async function generateAndSaveMatches(eventId: string): Promise<GenerateMatchesResult> {
  const supabase = await createUserSupabaseClient();

  const { data: event, error: eventError } = await supabase
    .from("events")
    .select("id, title")
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
  const { data: sideHistory, error: sideError } = await supabase
    .from("match_roster_snapshots")
    .select("student_id, position")
    .in("event_id", [eventId])
    .returns<{ student_id: string; position: string }[]>();
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

    // 房间池：从 A101 起按顺序找没用过的
    const roomNames: string[] = [];
    for (let index = 1; roomNames.length < 50; index += 1) {
      const candidate = `A${100 + index}`;
      if (!usedRooms.has(candidate)) roomNames.push(candidate);
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
      firstMatchStart: new Date(Date.now() + 3 * 86400_000),
      matchIntervalMinutes: 60,
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
