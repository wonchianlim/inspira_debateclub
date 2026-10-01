import "server-only";

import {
  computeBallotTotals,
  type BallotData,
  type BallotTemplateSchema,
  emptyBallotData,
} from "@/lib/domain/ballot-schema";
import type { HistoryEntry } from "@/lib/domain/student-history";
import { createUserSupabaseClient } from "@/lib/supabase/server";

/**
 * 学生查看已发布的评分表（Phase 7 / P7-6）。
 *
 * 规范第 14.3 节：**只有已发布**的评分表学生能看到。
 * 这条由 RLS 强制（`ballots_select_published_for_students`），
 * 这里再显式过滤一次 —— 界面依赖 RLS 静默过滤会很难排查。
 */

export type StudentBallot = {
  ballotId: string;
  matchId: string;
  matchNumber: number;
  roomName: string;
  scheduledStart: string;
  formatCode: string;
  templateName: string;
  schema: BallotTemplateSchema;
  /** 我所在的队伍与我的个人结果 */
  myTeamId: string;
  myTeamLabel: string;
  /** 个人逐项分（按学生范围） */
  myScores: { key: string; label: string; value: number }[];
  /** 我的个人总项（例如 JWSD 的 100 分、PF 的 30 分） */
  myTotals: { key: string; label: string; value: number; max: number }[];
  /** 队伍总项（例如 PF 的 60 分、JWSD 的 300 分） */
  teamTotals: { key: string; label: string; value: number; max: number }[];
  /**
   * 整场的评分项（模板里 `scope: "match"` 且 `type: "score"` 的字段）。
   *
   * 目前官方模板里只有「裁判信心」（1–3 档）。⚠️ 这一类字段**原来完全没有
   * 出现在学生端** —— 只映射了 `speaker` 范围的分数与 `match` 范围的**文字**，
   * 于是"裁判有多确定"这个信息被静默丢掉了。
   *
   * `optionLabel` 是模板里给的档位说明（3 →「清晰判决」）。规范 §8.7 要求
   * "Score breakdown using the exact ballot template labels" ——
   * 光给一个 2，学生不知道 2 是什么意思。
   */
  matchScores: { key: string; label: string; value: number; optionLabel: string | null }[];
  /** 正反方各自的队伍总分 —— 让学生看到胜负关系 */
  sideTotals: { teamId: string; label: string; total: number | null }[];
  winnerTeamId: string | null;
  /** 我赢了没有；null 表示这场没有胜方（例如 BP 的排名制） */
  outcome: "win" | "loss" | null;
  /** BP 的名次 */
  myRank: number | null;
  ranking: Record<string, number> | null;
  /** 队伍反馈（按队伍范围） */
  teamFeedback: { key: string; label: string; value: string }[];
  /** 整场的文字（判决理由、交锋等） */
  matchText: { key: string; label: string; value: string }[];
  /** 整场的列表（论点、交锋） */
  matchLists: { key: string; label: string; entries: string[] }[];
  /** 按队伍的列表（论点），只显示我这一队 */
  teamLists: { key: string; label: string; entries: string[] }[];
  /** 我的复核请求状态 */
  reviewStatus: string | null;
};

/** 当前学生能看到的所有已发布评分表。 */
export async function listMyPublishedBallots(): Promise<StudentBallot[]> {
  const supabase = await createUserSupabaseClient();

  const { data: profileId } = await supabase.rpc("current_profile_id");
  const { data: studentProfile } = await supabase
    .from("student_profiles")
    .select("id")
    .eq("profile_id", (profileId as string | null) ?? "")
    .maybeSingle();

  if (!studentProfile) return [];

  const { data, error } = await supabase
    .from("ballots")
    .select(
      "id, match_id, winner_team_id, format_data, status, reason_for_decision, " +
        "matches(id, match_number, room_name, scheduled_start, debate_formats(code), " +
        "match_teams(team_id, position, teams(team_label, team_members(participation_id, speaker_position, participations(student_id)))), " +
        "ballot_templates(name, schema)), " +
        "ballot_scores(participation_id, score_type, score_value), " +
        "ballot_feedback(target_type, target_id, feedback_type, feedback_text), " +
        "ballot_review_requests(requested_by_student_id, status)",
    )
    .eq("status", "published");

  if (error) throw new Error(`读取评分表失败：${error.message}`);

  type Row = Record<string, unknown>;
  const rows = (data ?? []) as unknown as Row[];

  const results: StudentBallot[] = [];

  for (const row of rows) {
    const match = row.matches as Row | null;
    if (!match) continue;

    const matchTeams = (match.match_teams ?? []) as Row[];
    const myMembership = matchTeams.find((matchTeam) =>
      ((matchTeam.teams as Row | null)?.team_members as Row[] | null)?.some(
        (member) =>
          ((member.participations as Row | null)?.student_id as string | undefined) ===
          (studentProfile.id as string),
      ),
    );
    if (!myMembership) continue; // 我不在这场里

    /*
     * ⚠️ 必须用**学生档案 id** 去比，不能拿 profile id。
     * `participations.student_id` 指向 `student_profiles.id` ——
     * 这两者混用是这一层最容易出的错，而且错了会静默返回"我不在这场里"。
     */
    const myTeamId = myMembership.team_id as string;
    const template = match.ballot_templates as Row | null;
    const schema = (template?.schema ?? null) as BallotTemplateSchema | null;
    if (!schema) continue;

    const data = emptyBallotData();
    const participationToStudent = new Map<string, string>();
    const studentPositions: Record<string, number> = {};
    const teamMembersByTeam: Record<string, string[]> = {};

    for (const matchTeam of matchTeams) {
      const teamId = matchTeam.team_id as string;
      teamMembersByTeam[teamId] = [];
      for (const member of ((matchTeam.teams as Row | null)?.team_members as Row[] | null) ?? []) {
        const studentId = (member.participations as Row | null)?.student_id as string | undefined;
        if (!studentId) continue;
        participationToStudent.set(member.participation_id as string, studentId);
        studentPositions[studentId] = (member.speaker_position as number | null) ?? 0;
        teamMembersByTeam[teamId]!.push(studentId);
      }
    }

    for (const score of (row.ballot_scores ?? []) as Row[]) {
      const studentId = participationToStudent.get(score.participation_id as string);
      if (!studentId) continue;
      data.speakerValues[studentId] = {
        ...(data.speakerValues[studentId] ?? {}),
        [score.score_type as string]: Number(score.score_value),
      };
    }

    const formatData = (row.format_data ?? {}) as {
      matchValues?: Record<string, unknown>;
      teamValues?: Record<string, Record<string, unknown>>;
    };
    data.matchValues = (formatData.matchValues ?? {}) as BallotData["matchValues"];
    data.teamValues = (formatData.teamValues ?? {}) as BallotData["teamValues"];

    const totals = computeBallotTotals(schema, data, { teamMembersByTeam });

    const myScores = schema.fields
      .filter((field) => field.scope === "speaker" && field.type === "score")
      .filter((field) => {
        if (!field.speakerPositions) return true;
        const position = studentPositions[studentProfile.id as string];
        return position === undefined || field.speakerPositions.includes(position);
      })
      .map((field) => ({
        key: field.key,
        label: field.label,
        value: Number(data.speakerValues[studentProfile.id as string]?.[field.key] ?? 0),
      }));

    const myTotals = (schema.totals ?? [])
      .filter((total) => total.scope === "speaker")
      .map((total) => ({
        key: total.key,
        label: total.label,
        value: totals.speakerTotals[studentProfile.id as string]?.[total.key] ?? 0,
        max: total.max,
      }));

    const matchScores = schema.fields
      .filter((field) => field.scope === "match" && field.type === "score")
      .flatMap((field) => {
        const raw = data.matchValues[field.key];
        // 没填的整场评分项不显示（这些字段通常是选填）——
        // 显示一个"0 分"会让学生以为裁判给他打了 0
        if (typeof raw !== "number") return [];
        const optionLabel = field.options?.find((option) => option.value === raw)?.label ?? null;
        return [{ key: field.key, label: field.label, value: raw, optionLabel }];
      });

    const teamTotals = (schema.totals ?? [])
      .filter((total) => total.scope === "team" || total.scope === "teamFromSpeakers")
      .map((total) => ({
        key: total.key,
        label: total.label,
        value: totals.teamTotals[myTeamId]?.[total.key] ?? 0,
        max: total.max,
      }));

    const sideTotals = matchTeams.map((matchTeam) => ({
      teamId: matchTeam.team_id as string,
      label:
        ((matchTeam.teams as Row | null)?.team_label as string | null) ??
        (matchTeam.position as string),
      total:
        (schema.totals ?? [])
          .filter((total) => total.scope === "team" || total.scope === "teamFromSpeakers")
          .map((total) => totals.teamTotals[matchTeam.team_id as string]?.[total.key])
          .find((value) => typeof value === "number") ?? null,
    }));

    const winnerTeamId = (row.winner_team_id as string | null) ?? null;

    // BP 用排名，没有胜方
    const rankingField = schema.fields.find((field) => field.type === "ranking");
    const ranking = rankingField
      ? ((data.matchValues[rankingField.key] as Record<string, number> | undefined) ?? null)
      : null;

    const teamText = (field: { key: string; label: string }) => {
      const raw = data.teamValues[myTeamId]?.[field.key];
      return typeof raw === "string" ? raw : "";
    };

    const teamFeedback = schema.fields
      .filter((field) => field.scope === "team" && field.type === "text")
      .map((field) => ({ key: field.key, label: field.label, value: teamText(field) }))
      .filter((entry) => entry.value.trim() !== "");

    const matchText = schema.fields
      .filter((field) => field.scope === "match" && field.type === "text")
      .map((field) => {
        const raw = data.matchValues[field.key];
        return { key: field.key, label: field.label, value: typeof raw === "string" ? raw : "" };
      })
      .filter((entry) => entry.value.trim() !== "");

    const toEntries = (raw: unknown): string[] => {
      if (!Array.isArray(raw)) return [];
      return raw
        .map((entry) =>
          typeof entry === "string" ? entry : ((entry as Record<string, string>).text ?? ""),
        )
        .filter((text) => text.trim() !== "");
    };

    const matchLists = schema.fields
      .filter((field) => field.scope === "match" && field.type === "list")
      .map((field) => ({
        key: field.key,
        label: field.label,
        entries: toEntries(data.matchValues[field.key]),
      }))
      .filter((entry) => entry.entries.length > 0);

    const teamLists = schema.fields
      .filter((field) => field.scope === "team" && field.type === "list")
      .map((field) => ({
        key: field.key,
        label: field.label,
        entries: toEntries(data.teamValues[myTeamId]?.[field.key]),
      }))
      .filter((entry) => entry.entries.length > 0);

    const review = ((row.ballot_review_requests ?? []) as Row[]).find(
      (request) => (request.requested_by_student_id as string) === (studentProfile.id as string),
    );

    results.push({
      ballotId: row.id as string,
      matchId: match.id as string,
      matchNumber: match.match_number as number,
      roomName: match.room_name as string,
      scheduledStart: match.scheduled_start as string,
      formatCode: ((match.debate_formats as Row | null)?.code as string) ?? "?",
      templateName: (template?.name as string | undefined) ?? "",
      schema,
      myTeamId,
      myTeamLabel:
        ((myMembership.teams as Row | null)?.team_label as string | null) ??
        (myMembership.position as string),
      myScores,
      myTotals,
      teamTotals,
      matchScores,
      sideTotals,
      winnerTeamId,
      outcome: winnerTeamId === null ? null : winnerTeamId === myTeamId ? "win" : "loss",
      myRank: ranking?.[myTeamId] ?? null,
      ranking,
      teamFeedback,
      matchText,
      matchLists,
      teamLists,
      reviewStatus: (review?.status as string | undefined) ?? null,
    });
  }

  return results.sort((a, b) => b.scheduledStart.localeCompare(a.scheduledStart));
}

/**
 * 把已发布的评分表转成历史统计的输入（Phase 8 / P8-2）。
 *
 * 放在这里而不是页面里，是因为"哪几个字段算历史"是个领域判断，
 * 不该散落在渲染代码里。
 */
export function toHistoryEntries(ballots: readonly StudentBallot[]): HistoryEntry[] {
  return ballots.map((ballot) => {
    const total = ballot.myTotals[0];
    const categoryScores: Record<string, number> = {};
    const categoryLabels: Record<string, { label: string; max: number }> = {};

    for (const score of ballot.myScores) {
      categoryScores[score.key] = score.value;
      const field = ballot.schema.fields.find((candidate) => candidate.key === score.key);
      categoryLabels[score.key] = {
        label: score.label,
        max: field?.max ?? 0,
      };
    }

    return {
      formatCode: ballot.formatCode,
      scheduledStart: ballot.scheduledStart,
      outcome: ballot.outcome,
      rank: ballot.myRank,
      speakerTotal: total?.value ?? null,
      speakerMax: total?.max ?? null,
      categoryScores,
      categoryLabels,
    };
  });
}
