import "server-only";

import { createUserSupabaseClient } from "@/lib/supabase/server";
import type { BallotStatus } from "@/lib/domain/ballot-lifecycle";

/**
 * 管理员复核评分表的读取层（Phase 7 / P7-5）。
 *
 * 规范第 15 节 Phase 7 要求 "manager review"，并把
 * "reopen / resubmit / **audit** / publish" 定为一条完整工作流。
 */

export type EventBallotRow = {
  ballotId: string;
  matchId: string;
  matchNumber: number;
  roomName: string;
  scheduledStart: string;
  formatCode: string;
  judgeName: string;
  status: BallotStatus;
  submittedAt: string | null;
  reopenedAt: string | null;
  publishedAt: string | null;
  /** 胜方队伍（没有则为 null，例如 BP 用排名） */
  winnerTeamId: string | null;
  /** 已提交的逐项分条数（用于一眼看出"有没有真的打分"） */
  scoreCount: number;
};

/** 某个活动下全部评分表（含尚未开始填的场次）。 */
export async function listEventBallots(eventId: string): Promise<EventBallotRow[]> {
  const supabase = await createUserSupabaseClient();

  const { data, error } = await supabase
    .from("matches")
    .select(
      "id, match_number, room_name, scheduled_start, debate_formats(code), " +
        "ballots(id, status, submitted_at, reopened_at, published_at, winner_team_id, judge_profiles(profiles(display_name)), " +
        "ballot_scores(participation_id, score_value))",
    )
    .eq("event_id", eventId)
    .order("match_number");

  if (error) throw new Error(`读取评分表失败：${error.message}`);

  type Row = {
    id: string;
    match_number: number;
    room_name: string;
    scheduled_start: string;
    debate_formats: { code: string } | null;
    ballots:
      | {
          id: string;
          status: string;
          submitted_at: string | null;
          reopened_at: string | null;
          published_at: string | null;
          winner_team_id: string | null;
          judge_profiles: { profiles: { display_name: string } | null } | null;
          ballot_scores: { participation_id: string; score_value: number }[] | null;
        }[]
      | null;
  };

  return ((data ?? []) as unknown as Row[]).flatMap((match) =>
    (match.ballots ?? []).map((ballot) => ({
      ballotId: ballot.id,
      matchId: match.id,
      matchNumber: match.match_number,
      roomName: match.room_name,
      scheduledStart: match.scheduled_start,
      formatCode: match.debate_formats?.code ?? "?",
      judgeName: ballot.judge_profiles?.profiles?.display_name ?? "（未知）",
      status: ballot.status as BallotStatus,
      submittedAt: ballot.submitted_at,
      reopenedAt: ballot.reopened_at,
      publishedAt: ballot.published_at,
      winnerTeamId: ballot.winner_team_id,
      /*
       * ⚠️ 逐项分是**按学生**存在 `ballot_scores` 里，而队伍总分要按队伍汇总，
       * 需要知道谁属于哪一队。这里**刻意不去猜** —— 只给出分数条数。
       * 队伍总分在评分表详情页里按模板算（那里有完整名单与 schema）。
       * 在这个列表页里自己拼一个映射，正是 Phase 5 犯过的错。
       */
      scoreCount: (ballot.ballot_scores ?? []).length,
    })),
  );
}

export type ReviewRequestRow = {
  requestId: string;
  ballotId: string;
  matchNumber: number;
  roomName: string;
  formatCode: string;
  studentName: string;
  reason: string;
  status: "open" | "reviewing" | "resolved" | "rejected";
  adminResponse: string | null;
  createdAt: string;
  resolvedAt: string | null;
};

/**
 * 某个活动下的复核请求（Phase 8）。
 *
 * 规范第 15 节 Phase 8 要求 "Ballot review request and **manager resolution**" ——
 * 学生那一侧（提交）在 P7-6b 做好了，这一侧是管理员的处理。
 */
export async function listEventReviewRequests(eventId: string): Promise<ReviewRequestRow[]> {
  const supabase = await createUserSupabaseClient();

  const { data, error } = await supabase
    .from("ballot_review_requests")
    .select(
      "id, reason, status, admin_response, created_at, resolved_at, " +
        "ballots(id, matches(id, match_number, room_name, event_id, debate_formats(code))), " +
        "student_profiles(profiles(display_name))",
    );

  if (error) throw new Error(`读取复核请求失败：${error.message}`);

  type Row = {
    id: string;
    reason: string;
    status: string;
    admin_response: string | null;
    created_at: string;
    resolved_at: string | null;
    ballots: {
      id: string;
      matches: {
        id: string;
        match_number: number;
        room_name: string;
        event_id: string;
        debate_formats: { code: string } | null;
      } | null;
    } | null;
    student_profiles: { profiles: { display_name: string } | null } | null;
  };

  return (
    ((data ?? []) as unknown as Row[])
      // 只保留本活动的 —— RLS 允许管理员看到**所有**活动的请求，因此这里必须自己过滤
      .filter((row) => row.ballots?.matches?.event_id === eventId)
      .map((row) => ({
        requestId: row.id,
        ballotId: row.ballots?.id ?? "",
        matchNumber: row.ballots?.matches?.match_number ?? 0,
        roomName: row.ballots?.matches?.room_name ?? "",
        formatCode: row.ballots?.matches?.debate_formats?.code ?? "?",
        studentName: row.student_profiles?.profiles?.display_name ?? "（未知）",
        reason: row.reason,
        status: row.status as ReviewRequestRow["status"],
        adminResponse: row.admin_response,
        createdAt: row.created_at,
        resolvedAt: row.resolved_at,
      }))
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
  );
}
