"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { getNoticeDetail } from "@/lib/admin/notices";
import { AREA_ROLES } from "@/lib/auth/roles";
import { getSessionContext } from "@/lib/auth/session";
import type { FormState } from "@/lib/forms/form-state";
import { createUserSupabaseClient } from "@/lib/supabase/server";
import { noticeIdSchema, noticeInputSchema, toNoticeRecord } from "@/lib/validation/notices";

/**
 * 通知的特权动作。
 *
 * 权限：`notices_insert_manager` / `notices_update_manager` / `notices_delete_manager`
 * 三条策略都要求 `is_manager()`（俱乐部管理员或超管）。
 * 本文件另外做一次显式检查，给出中文提示。
 *
 * ⚠️ 本阶段只做**站内通知**。邮件的实际投递属于 Phase 9，
 *    界面上已明确标注，避免管理员误以为"发了通知就等于发了邮件"。
 */

const NOT_AUTHORIZED = "只有俱乐部管理员或超级管理员可以管理通知。";

function failure(message: string, fieldErrors?: Record<string, string[]>): FormState {
  return { status: "error", message, fieldErrors };
}

async function requireManager(): Promise<{ profileId: string } | FormState> {
  const session = await getSessionContext();
  if (!session) return failure("登录状态已失效，请重新登录。");
  const allowed = AREA_ROLES.manage.some((role) => session.roles.includes(role));
  if (!allowed) return failure(NOT_AUTHORIZED);
  return { profileId: session.profileId };
}

function isFailure(value: { profileId: string } | FormState): value is FormState {
  return "status" in value;
}

function toFieldErrors(issues: { path: PropertyKey[]; message: string }[]) {
  const fieldErrors: Record<string, string[]> = {};
  for (const issue of issues) {
    const key = issue.path.map(String).join(".") || "_form";
    fieldErrors[key] = [...(fieldErrors[key] ?? []), issue.message];
  }
  return fieldErrors;
}

function readNoticeForm(formData: FormData) {
  return {
    title: formData.get("title"),
    body: formData.get("body"),
    audienceType: formData.get("audienceType"),
    eventId: formData.get("eventId") ?? undefined,
    role: formData.get("role") ?? undefined,
    formatId: formData.get("formatId") ?? undefined,
    publishMode: formData.get("publishMode"),
    publishedAtLocal: formData.get("publishedAtLocal") ?? undefined,
    expiresAtLocal: formData.get("expiresAtLocal") ?? undefined,
    timezone: formData.get("timezone") ?? undefined,
  };
}

function revalidateNotices(noticeId?: string) {
  revalidatePath("/manage/notices");
  revalidatePath("/notifications");
  if (noticeId) revalidatePath(`/manage/notices/${noticeId}`);
}

export async function createNoticeAction(
  _prevState: FormState,
  formData: FormData,
): Promise<FormState> {
  const parsed = noticeInputSchema.safeParse(readNoticeForm(formData));
  if (!parsed.success) {
    return failure("请检查表单内容。", toFieldErrors(parsed.error.issues));
  }

  const auth = await requireManager();
  if (isFailure(auth)) return auth;

  const supabase = await createUserSupabaseClient();
  const { data, error } = await supabase
    .from("notices")
    .insert({ ...toNoticeRecord(parsed.data), created_by: auth.profileId })
    .select("id")
    .single();

  if (error || !data) {
    console.error("[admin] 创建通知失败:", error?.message);
    return failure("创建通知失败，请稍后再试。");
  }

  revalidateNotices(data.id);
  redirect(`/manage/notices/${data.id}`);
}

export async function updateNoticeAction(
  _prevState: FormState,
  formData: FormData,
): Promise<FormState> {
  const noticeId = noticeIdSchema.safeParse(formData.get("noticeId"));
  if (!noticeId.success) return failure("通知标识格式不正确。");

  const parsed = noticeInputSchema.safeParse(readNoticeForm(formData));
  if (!parsed.success) {
    return failure("请检查表单内容。", toFieldErrors(parsed.error.issues));
  }

  const auth = await requireManager();
  if (isFailure(auth)) return auth;

  const existing = await getNoticeDetail(noticeId.data);
  if (!existing) return failure("找不到这条通知。");

  const supabase = await createUserSupabaseClient();
  const { error } = await supabase
    .from("notices")
    .update(toNoticeRecord(parsed.data))
    .eq("id", noticeId.data);

  if (error) {
    console.error("[admin] 更新通知失败:", error.message);
    return failure("保存失败，请稍后再试。");
  }

  revalidateNotices(noticeId.data);
  return { status: "success", message: "已保存。" };
}

/**
 * 删除通知。
 *
 * 允许删除，但审计日志里会保留这条通知的完整内容与删除者
 * （P2-2 的触发器在 DELETE 时会写入 old_value）。
 * 因此"删除"是"从界面上撤下"，不是"抹掉痕迹"。
 */
export async function deleteNoticeAction(
  _prevState: FormState,
  formData: FormData,
): Promise<FormState> {
  const noticeId = noticeIdSchema.safeParse(formData.get("noticeId"));
  if (!noticeId.success) return failure("通知标识格式不正确。");

  const auth = await requireManager();
  if (isFailure(auth)) return auth;

  const supabase = await createUserSupabaseClient();
  const { error } = await supabase.from("notices").delete().eq("id", noticeId.data);

  if (error) {
    console.error("[admin] 删除通知失败:", error.message);
    return failure("删除失败，请稍后再试。");
  }

  revalidateNotices(noticeId.data);
  redirect("/manage/notices");
}
