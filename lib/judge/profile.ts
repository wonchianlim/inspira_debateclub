import "server-only";

import type { JudgeHistoryEntry } from "@/lib/domain/judge-history";
import { createUserSupabaseClient } from "@/lib/supabase/server";

/**
 * 裁判自己的简介与历史（Phase 8 / P8-4）。
 *
 * 规范第 15 节 Phase 8："Judge history and **profile/paradigm experience**."
 *
 * `judge_profiles` 从 Phase 1 起就有 `paradigm` 与 `experience_notes` 两列，
 * 而且 RLS 允许裁判自己维护它们（`approval_status` 由触发器单独保护）——
 * 因此这里**不需要新迁移**。
 */

export type JudgeProfile = {
  judgeId: string;
  displayName: string;
  approvalStatus: string;
  paradigm: string | null;
  experienceNotes: string | null;
  /** 可执裁的赛制 */
  qualifiedFormats: string[];
};

export async function getMyJudgeProfile(): Promise<JudgeProfile | null> {
  const supabase = await createUserSupabaseClient();
  const { data: profileId } = await supabase.rpc("current_profile_id");

  const { data, error } = await supabase
    .from("judge_profiles")
    .select(
      "id, approval_status, paradigm, experience_notes, profiles(display_name), judge_format_qualifications(debate_formats(code))",
    )
    .eq("profile_id", (profileId as string | null) ?? "")
    .maybeSingle();

  if (error) throw new Error(`读取裁判档案失败：${error.message}`);
  if (!data) return null;

  type Row = {
    id: string;
    approval_status: string;
    paradigm: string | null;
    experience_notes: string | null;
    profiles: { display_name: string } | null;
    judge_format_qualifications: { debate_formats: { code: string } | null }[] | null;
  };

  const row = data as unknown as Row;

  return {
    judgeId: row.id,
    displayName: row.profiles?.display_name ?? "（未填姓名）",
    approvalStatus: row.approval_status,
    paradigm: row.paradigm,
    experienceNotes: row.experience_notes,
    qualifiedFormats: (row.judge_format_qualifications ?? [])
      .map((qualification) => qualification.debate_formats?.code)
      .filter((code): code is string => typeof code === "string")
      .sort(),
  };
}

/**
 * 这位裁判判过的所有场次。
 *
 * ⚠️ 用 `judge_profiles.id` 过滤。RLS 已经保证裁判只能看到自己的指派，
 *    但显式过滤能让"看到不该看的"变成不可能，而不是"依赖策略恰好写对了"。
 */
export async function listMyJudgeHistory(): Promise<JudgeHistoryEntry[]> {
  const supabase = await createUserSupabaseClient();
  const { data: profileId } = await supabase.rpc("current_profile_id");

  const { data: judgeProfile } = await supabase
    .from("judge_profiles")
    .select("id")
    .eq("profile_id", (profileId as string | null) ?? "")
    .maybeSingle();
  if (!judgeProfile) return [];

  const { data, error } = await supabase
    .from("judge_assignments")
    .select(
      "status, matches(match_number, debate_formats(code), " +
        "ballots(status, submitted_at, reopened_at, reason_for_decision, " +
        "ballot_scores(score_value)))",
    )
    .eq("judge_id", judgeProfile.id);

  if (error) throw new Error(`读取裁判历史失败：${error.message}`);

  type Row = {
    matches: {
      match_number: number;
      debate_formats: { code: string } | null;
      ballots:
        | {
            status: string;
            submitted_at: string | null;
            reopened_at: string | null;
            reason_for_decision: string | null;
            ballot_scores: { score_value: number }[] | null;
          }[]
        | null;
    } | null;
  };

  return ((data ?? []) as unknown as Row[])
    .filter((row) => row.matches !== null)
    .flatMap((row) => {
      const match = row.matches as NonNullable<Row["matches"]>;
      const ballot = (match.ballots ?? [])[0];
      // 还没有开始填的场次也计入"被指派"，但没有分数与理由
      const scores = (ballot?.ballot_scores ?? []).map((score) => Number(score.score_value));
      const average =
        scores.length === 0
          ? null
          : Math.round((scores.reduce((a, b) => a + b, 0) / scores.length) * 10) / 10;

      return [
        {
          formatCode: match.debate_formats?.code ?? "?",
          submittedAt: ballot?.submitted_at ?? null,
          status: (ballot?.status ?? "draft") as JudgeHistoryEntry["status"],
          averageScoreGiven: average,
          wasReopened: (ballot?.reopened_at ?? null) !== null,
          reasonLength: ballot?.reason_for_decision?.length ?? null,
        },
      ];
    });
}
