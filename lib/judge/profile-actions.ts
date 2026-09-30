"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { AREA_ROLES } from "@/lib/auth/roles";
import { requireAnyRole } from "@/lib/auth/session";
import type { FormState } from "@/lib/forms/form-state";
import { createUserSupabaseClient } from "@/lib/supabase/server";

/**
 * 裁判维护自己的简介与理念（Phase 8 / P8-4）。
 *
 * ⚠️ **只改这两列**。`approval_status` 由数据库触发器单独保护，
 *    裁判不能给自己批准 —— 这里也不去碰它。
 */

const profileSchema = z.object({
  paradigm: z.string().trim().max(2000, { error: "简介太长了，请精简到 2000 字以内。" }),
  experienceNotes: z.string().trim().max(4000, { error: "经验说明太长了，请精简到 4000 字以内。" }),
});

export async function saveJudgeProfileAction(
  _prevState: FormState,
  formData: FormData,
): Promise<FormState> {
  const parsed = profileSchema.safeParse({
    paradigm: formData.get("paradigm") ?? "",
    experienceNotes: formData.get("experienceNotes") ?? "",
  });
  if (!parsed.success) {
    return {
      status: "error",
      message: parsed.error.issues[0]?.message ?? "提交的内容格式不正确。",
    };
  }

  await requireAnyRole(AREA_ROLES.judge);
  const supabase = await createUserSupabaseClient();
  const { data: profileId } = await supabase.rpc("current_profile_id");

  const { error, count } = await supabase
    .from("judge_profiles")
    .update(
      {
        // 空字符串存成 null —— 让"没写"与"写了空"在数据库里是同一种状态
        paradigm: parsed.data.paradigm === "" ? null : parsed.data.paradigm,
        experience_notes: parsed.data.experienceNotes === "" ? null : parsed.data.experienceNotes,
      },
      { count: "exact" },
    )
    .eq("profile_id", (profileId as string | null) ?? "");

  if (error) {
    console.error("[judge] 保存简介失败:", error.message);
    return { status: "error", message: "保存失败，请稍后再试。" };
  }
  /*
   * ⚠️ RLS 的 UPDATE 是**静默过滤**：改不到就是 0 行、不会报错。
   * 不检查行数的话，"没有裁判档案的人点保存"会显示成功而什么都没发生。
   */
  if ((count ?? 0) === 0) {
    return { status: "error", message: "没有保存任何内容 —— 你的账号可能还没有裁判档案。" };
  }

  revalidatePath("/judge/profile");
  return { status: "success", message: "已保存。" };
}
