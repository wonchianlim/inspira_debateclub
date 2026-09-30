"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { AREA_ROLES } from "@/lib/auth/roles";
import { requireAnyRole } from "@/lib/auth/session";
import type { FormState } from "@/lib/forms/form-state";
import { createUserSupabaseClient } from "@/lib/supabase/server";

/**
 * 教练私人笔记（Phase 8 / P8-3b）。
 *
 * ⚠️ 两条由 RLS 与表约束强制的规则，这里**不重复实现**：
 *   - `coach_id` 只能是自己（`with check`）
 *   - 正文不能是空白（`check` 约束）
 */

const noteSchema = z.object({
  studentId: z.guid({ error: "学生标识格式不正确" }),
  body: z
    .string()
    .trim()
    .min(1, { error: "笔记不能为空。" })
    .max(4000, { error: "笔记太长了，请精简到 4000 字以内。" }),
});

export async function saveCoachNoteAction(
  _prevState: FormState,
  formData: FormData,
): Promise<FormState> {
  const parsed = noteSchema.safeParse({
    studentId: formData.get("studentId"),
    body: formData.get("body") ?? "",
  });
  if (!parsed.success) {
    return {
      status: "error",
      message: parsed.error.issues[0]?.message ?? "提交的内容格式不正确。",
    };
  }

  await requireAnyRole(AREA_ROLES.coach);
  const supabase = await createUserSupabaseClient();

  const { data: profileId } = await supabase.rpc("current_profile_id");

  const { error } = await supabase.from("coach_notes").insert({
    coach_id: profileId as string,
    student_id: parsed.data.studentId,
    body: parsed.data.body,
  });

  if (error) {
    console.error("[coach] 保存笔记失败:", error.message);
    return { status: "error", message: "保存失败，请稍后再试。" };
  }

  revalidatePath(`/coach/students/${parsed.data.studentId}`);
  return { status: "success", message: "笔记已保存。只有你自己能看到它。" };
}

const deleteSchema = z.object({
  noteId: z.guid({ error: "笔记标识格式不正确" }),
  studentId: z.guid({ error: "学生标识格式不正确" }),
});

/** 删除自己的一条笔记。别人的笔记删不动 —— RLS 会静默过滤成 0 行。 */
export async function deleteCoachNoteAction(
  _prevState: FormState,
  formData: FormData,
): Promise<FormState> {
  const parsed = deleteSchema.safeParse({
    noteId: formData.get("noteId"),
    studentId: formData.get("studentId"),
  });
  if (!parsed.success) return { status: "error", message: "提交的内容格式不正确。" };

  await requireAnyRole(AREA_ROLES.coach);
  const supabase = await createUserSupabaseClient();

  /*
   * ⚠️ RLS 的 DELETE 是**静默过滤**：删不到就是 0 行、**不会报错**。
   * 因此这里必须检查影响行数 —— 否则"删了别人的笔记没删掉"
   * 会显示成"删除成功"，而用户下次刷新才发现它还在。
   */
  const { error, count } = await supabase
    .from("coach_notes")
    .delete({ count: "exact" })
    .eq("id", parsed.data.noteId);

  if (error) {
    console.error("[coach] 删除笔记失败:", error.message);
    return { status: "error", message: "删除失败，请稍后再试。" };
  }
  if ((count ?? 0) === 0) {
    return {
      status: "error",
      message: "没有删除任何内容 —— 这条笔记可能不存在，或者不是你写的。",
    };
  }

  revalidatePath(`/coach/students/${parsed.data.studentId}`);
  return { status: "success", message: "笔记已删除。" };
}
