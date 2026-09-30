"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { requireAnyRole } from "@/lib/auth/session";
import { AREA_ROLES } from "@/lib/auth/roles";
import type { FormState } from "@/lib/forms/form-state";
import { createUserSupabaseClient } from "@/lib/supabase/server";

/**
 * 学生提交复核请求（Phase 7 / P7-6b）。
 *
 * 规范第 14 节要求学生能就评分表提出问题，而 `ballot_review_requests`
 * 表与 RLS 从 P7-1 就位（学生只能对自己的评分表、且只能对**已发布**的提交）。
 *
 * ⚠️ 两处权限由 RLS 强制，这里不重复实现：
 *   - 学生只能给自己创建请求（`student_id` 必须是自己）
 *   - 只能对**已发布**的评分表创建（未发布的看不到，也不该能提）
 */

const reviewRequestSchema = z.object({
  ballotId: z.guid({ error: "评分表标识格式不正确" }),
  reason: z
    .string()
    .trim()
    .min(10, { error: "请把问题写清楚一些（至少 10 个字），这样管理员才知道要看什么。" })
    .max(1000, { error: "说明太长了，请精简到 1000 字以内。" }),
});

export async function createBallotReviewRequestAction(
  _prevState: FormState,
  formData: FormData,
): Promise<FormState> {
  const parsed = reviewRequestSchema.safeParse({
    ballotId: formData.get("ballotId"),
    reason: formData.get("reason") ?? "",
  });
  if (!parsed.success) {
    return {
      status: "error",
      message: parsed.error.issues[0]?.message ?? "提交的内容格式不正确。",
    };
  }

  await requireAnyRole(AREA_ROLES.student);
  const supabase = await createUserSupabaseClient();

  const { data: profileId } = await supabase.rpc("current_profile_id");
  const { data: studentProfile } = await supabase
    .from("student_profiles")
    .select("id")
    .eq("profile_id", (profileId as string | null) ?? "")
    .maybeSingle();

  if (!studentProfile) {
    return { status: "error", message: "找不到你的学生档案，请联系管理员。" };
  }

  const { error } = await supabase.from("ballot_review_requests").insert({
    ballot_id: parsed.data.ballotId,
    requested_by_student_id: studentProfile.id,
    reason: parsed.data.reason,
    status: "open",
  });

  if (error) {
    /*
     * 唯一约束是 (ballot_id, student_id) —— 同一份评分表只能提一次。
     * 这条要单独说清楚，否则学生会反复点而不知道为什么没反应。
     */
    if (error.code === "23505") {
      return { status: "error", message: "你已经对这份评分表提过复核请求了，请等待管理员处理。" };
    }
    console.error("[student] 创建复核请求失败:", error.message);
    return { status: "error", message: "提交失败，请稍后再试。" };
  }

  revalidatePath("/student/ballots");
  return {
    status: "success",
    message: "已提交。管理员会看到你的请求，处理后会更新状态。",
  };
}
