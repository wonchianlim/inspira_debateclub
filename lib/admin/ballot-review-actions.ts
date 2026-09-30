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
