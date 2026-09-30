"use server";

import { revalidatePath } from "next/cache";

import { requireAnyRole } from "@/lib/auth/session";
import { AREA_ROLES } from "@/lib/auth/roles";
import type { BallotStatus } from "@/lib/domain/ballot-lifecycle";
import { checkBallotTransition } from "@/lib/domain/ballot-lifecycle";
import type { FormState } from "@/lib/forms/form-state";
import { createUserSupabaseClient } from "@/lib/supabase/server";
import { z } from "zod";

/**
 * 管理员复核：重开与发布（Phase 7 / P7-5）。
 *
 * 规范第 15 节 Phase 7 原文："Reopen/resubmit/**audit** and publish workflow."
 *
 * -----------------------------------------------------------------------------
 * ⚠️ 为什么不直接 UPDATE `ballots.status`
 *
 * 状态转换的规则、以及"重开必须给理由"，都写在数据库函数
 * `transition_ballot` 里（迁移 `20260929092700_ballot_workflow.sql`），
 * 那里也会因为 `ballots` 上的行级触发器而**自动进审计日志**。
 *
 * 如果这里直接 UPDATE，就会出现两条路径：一条被审计、一条不被审计，
 * 而"重开要被审计"正是规范明确要求的。因此这里**只通过那个函数**改状态。
 */

const transitionSchema = z.object({
  ballotId: z.guid({ error: "评分表标识格式不正确" }),
  matchId: z.guid({ error: "比赛标识格式不正确" }),
  eventId: z.guid({ error: "活动标识格式不正确" }),
  to: z.enum(["reopened", "published"]),
  reason: z.string().max(500).optional(),
});

/**
 * 重开或发布一份评分表。
 *
 * 权限由 `requireAnyRole(AREA_ROLES.manage)` 与数据库函数双重把关 ——
 * 界面上的按钮只是不让人看到会失败的操作，**不是**权限本身。
 */
export async function transitionBallotAction(
  _prevState: FormState,
  formData: FormData,
): Promise<FormState> {
  const parsed = transitionSchema.safeParse({
    ballotId: formData.get("ballotId"),
    matchId: formData.get("matchId"),
    eventId: formData.get("eventId"),
    to: formData.get("to"),
    reason: formData.get("reason") ?? undefined,
  });
  if (!parsed.success) return { status: "error", message: "提交的内容格式不正确。" };

  await requireAnyRole(AREA_ROLES.manage);
  const supabase = await createUserSupabaseClient();

  // 先读出当前状态，用纯函数给出**可直接显示**的中文原因
  const { data: current, error: readError } = await supabase
    .from("ballots")
    .select("status")
    .eq("id", parsed.data.ballotId)
    .maybeSingle();

  if (readError || !current) {
    return { status: "error", message: "找不到这份评分表，或你没有权限操作它。" };
  }

  const check = checkBallotTransition(current.status as BallotStatus, parsed.data.to, "manager");
  if (!check.allowed) return { status: "error", message: check.message };

  const { error } = await supabase.rpc("transition_ballot", {
    p_ballot_id: parsed.data.ballotId,
    p_to: parsed.data.to,
    p_reason: parsed.data.reason ?? undefined,
  });

  if (error) {
    /*
     * 数据库的拒绝信息是中文且可直接显示（迁移里刻意这么写的）。
     * 这里把原文透出去 —— 换成"操作失败"会让管理员完全不知道该怎么办。
     */
    console.error("[admin] 评分表状态转换失败:", error.message);
    return { status: "error", message: error.message };
  }

  revalidatePath(`/manage/events/${parsed.data.eventId}/ballots`);
  revalidatePath(`/judge/matches/${parsed.data.matchId}`);
  revalidatePath("/judge");

  return {
    status: "success",
    message:
      parsed.data.to === "reopened"
        ? "已重开。这位裁判现在可以修改并重新提交（重开已记入审计日志）。"
        : "已发布。学生现在可以看到这份评分表。",
  };
}

const resolveSchema = z.object({
  requestId: z.guid({ error: "复核请求标识格式不正确" }),
  eventId: z.guid({ error: "活动标识格式不正确" }),
  /** 只能改成这两个状态：受理后可以"处理中"，最终要么已处理要么驳回 */
  status: z.enum(["reviewing", "resolved", "rejected"]),
  response: z.string().trim().max(1000, { error: "回复太长了，请精简到 1000 字以内。" }).optional(),
});

/**
 * 处理一份复核请求（Phase 8）。
 *
 * 规范第 15 节 Phase 8："Ballot review request and manager resolution."
 *
 * ⚠️ 规范 §17 把"学生能否撤回或重开复核请求"列为**不能自行决定**的事项，
 *    因此这里**刻意不提供**学生侧的撤回功能，也不允许管理员把请求退回 open ——
 *    一旦受理，就只有"已处理"或"驳回"两个终点。
 *
 * ⚠️ 状态改成 `resolved` / `rejected` 时**必须写回复**。
 *    让管理员只点一个按钮而学生看不到任何解释，
 *    与不做这个功能没有区别 —— 学生只会觉得被无视了。
 */
export async function resolveBallotReviewRequestAction(
  _prevState: FormState,
  formData: FormData,
): Promise<FormState> {
  const parsed = resolveSchema.safeParse({
    requestId: formData.get("requestId"),
    eventId: formData.get("eventId"),
    status: formData.get("status"),
    response: formData.get("response") ?? undefined,
  });
  if (!parsed.success) {
    return {
      status: "error",
      message: parsed.error.issues[0]?.message ?? "提交的内容格式不正确。",
    };
  }

  await requireAnyRole(AREA_ROLES.manage);

  if (
    (parsed.data.status === "resolved" || parsed.data.status === "rejected") &&
    (parsed.data.response ?? "").trim().length < 5
  ) {
    return {
      status: "error",
      message: "结束处理时必须写一句回复（至少 5 个字），否则学生看不到任何解释。",
    };
  }

  const supabase = await createUserSupabaseClient();
  const { data: profileId } = await supabase.rpc("current_profile_id");

  const { error } = await supabase
    .from("ballot_review_requests")
    .update({
      status: parsed.data.status,
      admin_response: parsed.data.response ?? null,
      // 只有真正结束时才记处理人与时间；"处理中"不算结束
      ...(parsed.data.status === "reviewing"
        ? {}
        : { resolved_by: profileId as string, resolved_at: new Date().toISOString() }),
    })
    .eq("id", parsed.data.requestId);

  if (error) {
    console.error("[admin] 处理复核请求失败:", error.message);
    return { status: "error", message: "保存失败，请稍后再试。" };
  }

  revalidatePath(`/manage/events/${parsed.data.eventId}/ballots`);
  revalidatePath("/student/ballots");

  const messages: Record<string, string> = {
    reviewing: "已标为处理中。",
    resolved: "已处理，学生可以看到你的回复。",
    rejected: "已驳回，学生可以看到你的说明。",
  };
  return { status: "success", message: messages[parsed.data.status] ?? "已保存。" };
}
