import "server-only";

import { createUserSupabaseClient } from "@/lib/supabase/server";
import type { BallotData, BallotTemplateSchema } from "@/lib/domain/ballot-schema";
import { emptyBallotData } from "@/lib/domain/ballot-schema";
import type { BallotStatus } from "@/lib/domain/ballot-lifecycle";

/**
 * 裁判填表的读取层（Phase 7 / P7-4）。
 *
 * 权限由 RLS 保证（`ballots_judge_own`、`matches_select_assigned_judge`），
 * 这里只是把裁判需要的数据组织好。
 */

export type JudgeAssignedMatch = {
  matchId: string;
  matchNumber: number;
  roomName: string;
  formatCode: string;
  scheduledStart: string;
  matchStatus: string;
  /** 这份评分表的状态；null 表示还没开始填 */
  ballotStatus: BallotStatus | null;
  /** 是否已经有**该赛制的活跃模板** —— 没有的话裁判根本没法打分 */
  hasTemplate: boolean;
};

/**
 * 某位裁判被指派的比赛。
 *
 * 用 `judge_profiles` 里属于当前用户的档案来找 —— 规范第 11 节要求
 * 裁判只能看到指派给自己的比赛（RLS `matches_select_assigned_judge` 已强制）。
 */
export async function listMyAssignedMatches(): Promise<JudgeAssignedMatch[]> {
  const supabase = await createUserSupabaseClient();

  const { data: judgeProfile, error: judgeError } = await supabase
    .from("judge_profiles")
    .select("id")
    .eq("profile_id", (await currentProfileId(supabase)) ?? "")
    .maybeSingle();

  if (judgeError) throw new Error(`读取裁判档案失败：${judgeError.message}`);
  if (!judgeProfile) return [];

  const { data, error } = await supabase
    .from("judge_assignments")
    .select(
      "status, matches(id, match_number, room_name, scheduled_start, status, format_id, " +
        "debate_formats(code), ballot_templates(format_id, active))",
    )
    .eq("judge_id", judgeProfile.id)
    .neq("status", "cancelled");

  if (error) throw new Error(`读取指派失败：${error.message}`);

  type Row = {
    matches: {
      id: string;
      match_number: number;
      room_name: string;
      scheduled_start: string;
      status: string;
      format_id: string;
      debate_formats: { code: string } | null;
      ballot_templates: { format_id: string; active: boolean }[] | null;
    } | null;
  };

  const matchIds = ((data ?? []) as unknown as Row[])
    .map((row) => row.matches?.id)
    .filter((id): id is string => Boolean(id));

  const { data: ballots } =
    matchIds.length === 0
      ? { data: [] as { match_id: string; status: BallotStatus }[] }
      : await supabase.from("ballots").select("match_id, status").in("match_id", matchIds);

  const ballotByMatch = new Map(
    (ballots ?? []).map(
      (ballot) => [ballot.match_id as string, ballot.status as BallotStatus] as const,
    ),
  );

  return ((data ?? []) as unknown as Row[])
    .map((row) => row.matches)
    .filter((match): match is NonNullable<Row["matches"]> => match !== null)
    .map((match) => ({
      matchId: match.id,
      matchNumber: match.match_number,
      roomName: match.room_name,
      formatCode: match.debate_formats?.code ?? "?",
      scheduledStart: match.scheduled_start,
      matchStatus: match.status,
      ballotStatus: ballotByMatch.get(match.id) ?? null,
      hasTemplate: (match.ballot_templates ?? []).some(
        (template) => template.format_id === match.format_id && template.active,
      ),
    }))
    .sort(
      (a, b) => a.scheduledStart.localeCompare(b.scheduledStart) || a.matchNumber - b.matchNumber,
    );
}

export type BallotContext = {
  matchId: string;
  matchNumber: number;
  roomName: string;
  formatCode: string;
  scheduledStart: string;
  matchStatus: string;
  templateId: string;
  templateName: string;
  templateVersion: number;
  schema: BallotTemplateSchema;
  /** 本场的学生（`scope: speaker` 的字段要按这些人逐个打分） */
  speakers: {
    studentId: string;
    participationId: string;
    displayName: string;
    teamId: string | null;
    /** 发言位次（1 起）。JWSD 的回复发言者是第 4 位，用另一组字段。 */
    speakerPosition: number;
  }[];
  /** 本场的队伍（`scope: team` 的字段按这些队伍） */
  teams: { teamId: string; teamLabel: string | null; position: string }[];
  /** 学生 id → 发言位次，直接喂给 `canSubmitBallot` 的 `expectedIds` */
  speakerPositionByStudent: Record<string, number>;
  /** 队伍 id → 队员学生 id，`teamFromSpeakers` 型总项需要 */
  teamMembersByTeam: Record<string, string[]>;
  ballotId: string | null;
  ballotStatus: BallotStatus | null;
  winnerTeamId: string | null;
  reasonForDecision: string | null;
  data: BallotData;
};

/** 读取某场比赛的填表上下文。裁判只能读自己**被指派**的比赛（RLS 强制）。 */
export async function getBallotContext(matchId: string): Promise<BallotContext | null> {
  const supabase = await createUserSupabaseClient();

  const { data: matchData, error: matchError } = await supabase
    .from("matches")
    .select(
      "id, match_number, room_name, scheduled_start, status, format_id, debate_formats(code), " +
        "match_teams(team_id, position, teams(team_label, team_members(participation_id, speaker_position, participations(student_id, student_profiles(profiles(display_name))))))",
    )
    .eq("id", matchId)
    .maybeSingle();

  if (matchError) throw new Error(`读取比赛失败：${matchError.message}`);
  if (!matchData) return null;

  type MatchRow = {
    id: string;
    match_number: number;
    room_name: string;
    scheduled_start: string;
    status: string;
    format_id: string;
    debate_formats: { code: string } | null;
    match_teams:
      | {
          team_id: string;
          position: string;
          teams: {
            team_label: string | null;
            team_members:
              | {
                  participation_id: string;
                  speaker_position: number | null;
                  participations: {
                    student_id: string;
                    student_profiles: { profiles: { display_name: string } | null } | null;
                  } | null;
                }[]
              | null;
          } | null;
        }[]
      | null;
  };

  const match = matchData as unknown as MatchRow;

  // 该赛制的**活跃模板**（规范：模板版本化，同时只有一个活跃）
  const { data: templateData, error: templateError } = await supabase
    .from("ballot_templates")
    .select("id, name, version, schema")
    .eq("format_id", match.format_id)
    .eq("active", true)
    .maybeSingle();

  if (templateError) throw new Error(`读取评分表模板失败：${templateError.message}`);
  if (!templateData) return null; // 没有模板 → 裁判无法打分，界面据此提示

  const speakers = (match.match_teams ?? []).flatMap((matchTeam) =>
    (matchTeam.teams?.team_members ?? [])
      .map((member) => ({
        studentId: member.participations?.student_id ?? "",
        participationId: member.participation_id,
        displayName: member.participations?.student_profiles?.profiles?.display_name ?? "（未知）",
        teamId: matchTeam.team_id,
        speakerPosition: member.speaker_position ?? 0,
      }))
      .filter((speaker) => speaker.studentId !== ""),
  );

  const teams = (match.match_teams ?? []).map((matchTeam) => ({
    teamId: matchTeam.team_id,
    teamLabel: matchTeam.teams?.team_label ?? null,
    position: matchTeam.position,
  }));

  const { data: ballotData } = await supabase
    .from("ballots")
    .select("id, status, winner_team_id, reason_for_decision, format_data")
    .eq("match_id", matchId)
    .maybeSingle();

  const data = emptyBallotData();
  if (ballotData) {
    const formatData = (ballotData.format_data ?? {}) as {
      matchValues?: Record<string, unknown>;
      teamValues?: Record<string, Record<string, unknown>>;
    };
    data.matchValues = (formatData.matchValues ?? {}) as BallotData["matchValues"];
    data.teamValues = (formatData.teamValues ?? {}) as BallotData["teamValues"];

    // 逐项分从 ballot_scores 读回来，按 participation_id 对应回学生
    const { data: scores } = await supabase
      .from("ballot_scores")
      .select("participation_id, score_type, score_value")
      .eq("ballot_id", ballotData.id as string);

    const participationToStudent = new Map(
      speakers.map((speaker) => [speaker.participationId, speaker.studentId] as const),
    );

    for (const score of scores ?? []) {
      const studentId = participationToStudent.get(score.participation_id as string);
      if (!studentId) continue;
      data.speakerValues[studentId] = {
        ...(data.speakerValues[studentId] ?? {}),
        [score.score_type as string]: Number(score.score_value),
      };
    }
  }

  return {
    matchId: match.id,
    matchNumber: match.match_number,
    roomName: match.room_name,
    formatCode: match.debate_formats?.code ?? "?",
    scheduledStart: match.scheduled_start,
    matchStatus: match.status,
    templateId: templateData.id as string,
    templateName: templateData.name as string,
    templateVersion: templateData.version as number,
    schema: templateData.schema as unknown as BallotTemplateSchema,
    speakers: speakers
      .map((speaker) => ({
        studentId: speaker.studentId,
        participationId: speaker.participationId,
        displayName: speaker.displayName,
        teamId: speaker.teamId,
        speakerPosition: speaker.speakerPosition,
      }))
      .sort((a, b) => a.speakerPosition - b.speakerPosition),
    teams,
    speakerPositionByStudent: Object.fromEntries(
      speakers.map((speaker) => [speaker.studentId, speaker.speakerPosition] as const),
    ),
    teamMembersByTeam: teams.reduce<Record<string, string[]>>((accumulator, team) => {
      accumulator[team.teamId] = speakers
        .filter((speaker) => speaker.teamId === team.teamId)
        .map((speaker) => speaker.studentId);
      return accumulator;
    }, {}),
    ballotId: (ballotData?.id as string | undefined) ?? null,
    ballotStatus: (ballotData?.status as BallotStatus | undefined) ?? null,
    winnerTeamId: (ballotData?.winner_team_id as string | undefined) ?? null,
    reasonForDecision: (ballotData?.reason_for_decision as string | undefined) ?? null,
    data,
  };
}

/** 当前登录用户的 profile id。 */
async function currentProfileId(
  supabase: Awaited<ReturnType<typeof createUserSupabaseClient>>,
): Promise<string | null> {
  const { data } = await supabase.rpc("current_profile_id");
  return (data as string | null) ?? null;
}
