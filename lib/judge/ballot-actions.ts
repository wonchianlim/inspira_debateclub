"use server";

import { revalidatePath } from "next/cache";

import { getBallotContext } from "@/lib/judge/ballots";
import {
  type BallotData,
  type BallotValue,
  canSubmitBallot,
  emptyBallotData,
} from "@/lib/domain/ballot-schema";
import type { FormState } from "@/lib/forms/form-state";
import { getSessionContext } from "@/lib/auth/session";
import { createUserSupabaseClient } from "@/lib/supabase/server";
import { ballotValuesSchema } from "@/lib/validation/ballot-submission";

/**
 * 裁判填表（Phase 7 / P7-4，规范第 15 节）。
 *
 * 规范原文："Draft save, format validation, submission, manager review."
 *
 * 三条实现要点：
 *   1. **草稿可以随意保存**（甚至完全不完整）—— 裁判是边听边记的；
 *   2. **提交必须通过模板校验** —— 分数区间、必填项、漏打都要拦住；
 *   3. 已提交（或已发布）的评分表，**裁判自己不能再改** ——
 *      要改必须由管理员走"重开"流程（规范要求重开被审计，见 P7-5）。
 */

function failure(message: string): FormState {
  return { status: "error", message };
}

/** 把表单传来的 JSON 解析成 `BallotData`；解析失败返回 null。 */
function parseBallotData(speakerScoresJson: string, otherValuesJson: string): BallotData | null {
  const data = emptyBallotData();

  try {
    const speakerEntries = JSON.parse(speakerScoresJson || "{}") as Record<string, BallotValue>;
    for (const [compositeKey, value] of Object.entries(speakerEntries)) {
      const separatorIndex = compositeKey.indexOf("|");
      if (separatorIndex <= 0) continue;
      const studentId = compositeKey.slice(0, separatorIndex);
      const fieldKey = compositeKey.slice(separatorIndex + 1);
      if (!studentId || !fieldKey) continue;
      data.speakerValues[studentId] = {
        ...(data.speakerValues[studentId] ?? {}),
        [fieldKey]: value,
      };
    }
  } catch {
    return null;
  }

  try {
    const otherEntries = JSON.parse(otherValuesJson || "{}") as Record<string, BallotValue>;
    for (const [compositeKey, value] of Object.entries(otherEntries)) {
      const separatorIndex = compositeKey.indexOf("|");
      if (separatorIndex <= 0) {
        // 没有分隔符 → 整场级字段
        data.matchValues[compositeKey] = value;
        continue;
      }
      const teamId = compositeKey.slice(0, separatorIndex);
      const fieldKey = compositeKey.slice(separatorIndex + 1);
      if (!teamId || !fieldKey) continue;
      data.teamValues[teamId] = { ...(data.teamValues[teamId] ?? {}), [fieldKey]: value };
    }
  } catch {
    return null;
  }

  return data;
}

async function persistBallot(
  matchId: string,
  data: BallotData,
  winnerTeamId: string | null,
  reasonForDecision: string | null,
  templateId: string,
  status: "draft" | "submitted",
): Promise<FormState> {
  const supabase = await createUserSupabaseClient();

  // 当前用户对应的裁判档案
  const { data: profileId } = await supabase.rpc("current_profile_id");
  const { data: judgeProfile } = await supabase
    .from("judge_profiles")
    .select("id")
    .eq("profile_id", (profileId as string | null) ?? "")
    .maybeSingle();

  if (!judgeProfile) return failure("只有裁判账号可以填写评分表。");

  const { data: existing } = await supabase
    .from("ballots")
    .select("id, status")
    .eq("match_id", matchId)
    .eq("judge_id", judgeProfile.id)
    .maybeSingle();

  /*
   * ⚠️ 已提交/已重交/已发布的评分表，裁判**自己不能再改**。
   *
   * 规范要求"重开"是管理员的一个动作且要被审计（P7-5）。
   * 如果这里允许裁判直接覆盖已提交的内容，那条流程就形同虚设，
   * 而且"提交"这个动作也不再意味着任何东西。
   */
  if (existing && existing.status !== "draft" && existing.status !== "reopened") {
    return failure("这份评分表已经提交，裁判不能直接修改。如果需要更正，请联系管理员重开。");
  }

  const formatData = { matchValues: data.matchValues, teamValues: data.teamValues };
  const now = new Date().toISOString();

  let ballotId: string;
  if (existing) {
    const { error } = await supabase
      .from("ballots")
      .update({
        template_id: templateId,
        winner_team_id: winnerTeamId,
        reason_for_decision: reasonForDecision,
        format_data: JSON.parse(JSON.stringify(formatData)) as never,
        status,
        ...(status === "submitted"
          ? {
              submitted_at: now,
              // 从 reopened 再提交记为 resubmitted（规范的状态机）
              ...(existing.status === "reopened" ? { resubmitted_at: now } : {}),
            }
          : {}),
      })
      .eq("id", existing.id);
    if (error) {
      console.error("[judge] 保存评分表失败:", error.message);
      return failure("保存失败，请稍后再试。");
    }
    ballotId = existing.id as string;
  } else {
    const { data: inserted, error } = await supabase
      .from("ballots")
      .insert({
        match_id: matchId,
        judge_id: judgeProfile.id,
        template_id: templateId,
        winner_team_id: winnerTeamId,
        reason_for_decision: reasonForDecision,
        format_data: JSON.parse(JSON.stringify(formatData)) as never,
        status,
        submitted_at: status === "submitted" ? now : null,
      })
      .select("id")
      .single();
    if (error || !inserted) {
      console.error("[judge] 创建评分表失败:", error?.message);
      return failure("保存失败，请稍后再试。");
    }
    ballotId = inserted.id as string;
  }

  /*
   * 逐项分：先删后写。
   *
   * `ballot_scores` 上有 `UNIQUE (ballot_id, participation_id, score_type)`，
   * 逐条 upsert 在"某项被清空"时不会删掉旧行，于是已经删掉的分数会残留。
   * 先清空再写入能保证数据库里的就是界面上看到的。
   */
  const { error: deleteError } = await supabase
    .from("ballot_scores")
    .delete()
    .eq("ballot_id", ballotId);
  if (deleteError) {
    console.error("[judge] 清空旧分数失败:", deleteError.message);
    return failure("保存失败，请稍后再试。");
  }

  const { data: participations } = await supabase
    .from("match_teams")
    .select("teams(team_members(participation_id, participations(student_id)))")
    .eq("match_id", matchId);

  type Row = {
    teams: {
      team_members:
        { participation_id: string; participations: { student_id: string } | null }[] | null;
    } | null;
  };

  const participationByStudent = new Map<string, string>();
  for (const row of (participations ?? []) as unknown as Row[]) {
    for (const member of row.teams?.team_members ?? []) {
      const studentId = member.participations?.student_id;
      if (studentId) participationByStudent.set(studentId, member.participation_id);
    }
  }

  const scoreRows = Object.entries(data.speakerValues).flatMap(([studentId, values]) => {
    const participationId = participationByStudent.get(studentId);
    if (!participationId) return [];
    return Object.entries(values)
      .filter(([, value]) => value !== null && value !== undefined && value !== "")
      .map(([scoreType, value]) => ({
        ballot_id: ballotId,
        participation_id: participationId,
        score_type: scoreType,
        score_value: Number(value),
      }))
      .filter((row) => Number.isFinite(row.score_value));
  });

  if (scoreRows.length > 0) {
    const { error } = await supabase.from("ballot_scores").insert(scoreRows);
    if (error) {
      console.error("[judge] 写入逐项分失败:", error.message);
      return failure("保存失败，请稍后再试。");
    }
  }

  return { status: "success", message: "" };
}

/** 保存草稿 —— **不做内容校验**（裁判是边听边记的）。 */
export async function saveBallotDraftAction(
  _prevState: FormState,
  formData: FormData,
): Promise<FormState> {
  const parsed = ballotValuesSchema.safeParse({
    matchId: formData.get("matchId"),
    winnerTeamId: formData.get("winnerTeamId") ?? "",
    reasonForDecision: formData.get("reasonForDecision") ?? "",
    speakerScoresJson: formData.get("speakerScoresJson") ?? "{}",
    otherValuesJson: formData.get("otherValuesJson") ?? "{}",
  });
  if (!parsed.success) return failure("提交的内容格式不正确。");

  const session = await getSessionContext();
  if (!session) return failure("登录状态已失效，请重新登录。");

  const context = await getBallotContext(parsed.data.matchId);
  if (!context) return failure("找不到这场比赛，或它还没有配置评分表模板。");

  const data = parseBallotData(parsed.data.speakerScoresJson, parsed.data.otherValuesJson);
  if (!data) return failure("提交的内容格式不正确。");

  const result = await persistBallot(
    parsed.data.matchId,
    data,
    parsed.data.winnerTeamId || null,
    parsed.data.reasonForDecision || null,
    context.templateId,
    "draft",
  );

  if (result.status === "error") return result;
  revalidatePath(`/judge/matches/${parsed.data.matchId}`);
  revalidatePath("/judge");
  return { status: "success", message: "草稿已保存。你可以随时回来继续。" };
}

/** 提交评分表 —— **必须通过模板校验**。 */
export async function submitBallotAction(
  _prevState: FormState,
  formData: FormData,
): Promise<FormState> {
  const parsed = ballotValuesSchema.safeParse({
    matchId: formData.get("matchId"),
    winnerTeamId: formData.get("winnerTeamId") ?? "",
    reasonForDecision: formData.get("reasonForDecision") ?? "",
    speakerScoresJson: formData.get("speakerScoresJson") ?? "{}",
    otherValuesJson: formData.get("otherValuesJson") ?? "{}",
  });
  if (!parsed.success) return failure("提交的内容格式不正确。");

  const session = await getSessionContext();
  if (!session) return failure("登录状态已失效，请重新登录。");

  const context = await getBallotContext(parsed.data.matchId);
  if (!context) return failure("找不到这场比赛，或它还没有配置评分表模板。");

  const data = parseBallotData(parsed.data.speakerScoresJson, parsed.data.otherValuesJson);
  if (!data) return failure("提交的内容格式不正确。");

  /*
   * 内容校验。`expectedIds` 把本场**应该被打分**的学生与队伍传进去 ——
   * 只校验"已填的项"是不够的，那样裁判可以一个人都不打就提交。
   */
  const validation = canSubmitBallot(context.schema, data, {
    winnerTeamId: parsed.data.winnerTeamId || null,
    reasonForDecision: parsed.data.reasonForDecision || null,
    expectedIds: {
      studentIds: context.speakers.map((speaker) => speaker.studentId),
      teamIds: context.teams.map((team) => team.teamId),
    },
  });

  if (!validation.valid) {
    // 把问题逐条列出，裁判才知道到底缺什么
    return failure(`还不能提交：${validation.issues.map((issue) => issue.message).join("；")}`);
  }

  const result = await persistBallot(
    parsed.data.matchId,
    data,
    parsed.data.winnerTeamId || null,
    parsed.data.reasonForDecision || null,
    context.templateId,
    "submitted",
  );

  if (result.status === "error") return result;
  revalidatePath(`/judge/matches/${parsed.data.matchId}`);
  revalidatePath("/judge");
  return { status: "success", message: "评分表已提交。提交之后如需更正，请联系管理员重开。" };
}
