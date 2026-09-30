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
