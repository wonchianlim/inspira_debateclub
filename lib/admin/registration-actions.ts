"use server";

import { revalidatePath } from "next/cache";

import { AREA_ROLES } from "@/lib/auth/roles";
import { getSessionContext } from "@/lib/auth/session";
import type { FormState } from "@/lib/forms/form-state";
import { createUserSupabaseClient } from "@/lib/supabase/server";
import {
  adminAddRegistrationSchema,
  adminSetRegistrationStatusSchema,
} from "@/lib/validation/admin-registrations";

/**
 * 管理员对报名的人工修正（Phase 3 / P3-6）。
 *
 * 权限：数据库的 `registrations_manage` 策略要求 `is_manager()`。
 * 本文件再做一次显式检查，给出中文提示。
 *
 * 规范第 9.2 节第 5 条要求"截止前取消记 cancelled、截止后记 late_cancelled"，
 * 但**管理员的人工操作不受这个时间限制** —— 管理员本来就是在处理异常情况
 * （学生打电话来说不能来了、实际到场了但没签到等等）。
 * 因此这里允许管理员指定任何合法状态，而不是替他按时间推算。
 * 每一次改动都会被审计触发器记录（P3-1 已把 registrations 加入审计）。
 */

function failure(message: string): FormState {
  return { status: "error", message };
}

async function requireManager(): Promise<{ profileId: string } | FormState> {
  const session = await getSessionContext();
  if (!session) return failure("登录状态已失效，请重新登录。");
  const allowed = AREA_ROLES.manage.some((role) => session.roles.includes(role));
  if (!allowed) return failure("只有俱乐部管理员或超级管理员可以处理报名。");
  return { profileId: session.profileId };
}

function isFailure(value: { profileId: string } | FormState): value is FormState {
  return "status" in value;
}

const STATUS_LABELS: Record<string, string> = {
  registered: "已报名",
  cancelled: "已取消",
  late_cancelled: "已取消（迟）",
  checked_in: "已签到",
  no_show: "未到场",
};

function revalidateRegistrations(eventId: string) {
  revalidatePath(`/manage/events/${eventId}/registrations`);
  revalidatePath(`/manage/events/${eventId}`);
  revalidatePath("/manage/events");
}

// -----------------------------------------------------------------------------
// 修改报名状态（含标记未到场、人工取消、恢复）
// -----------------------------------------------------------------------------
export async function setRegistrationStatusAction(
  _prevState: FormState,
  formData: FormData,
): Promise<FormState> {
  const parsed = adminSetRegistrationStatusSchema.safeParse({
    registrationId: formData.get("registrationId"),
    status: formData.get("status"),
  });
  if (!parsed.success) return failure("报名参数不正确。");

  const auth = await requireManager();
  if (isFailure(auth)) return auth;

  const supabase = await createUserSupabaseClient();

  // 先取活动 id（用于重新验证页面），并确认这条报名存在
  const { data: registration } = await supabase
    .from("registrations")
    .select("id, event_id, status")
    .eq("id", parsed.data.registrationId)
    .maybeSingle();

  if (!registration) return failure("找不到这条报名记录。");

  /*
   * `cancelled_at` 的维护：取消类状态要有时间，改回有效状态要清空。
   * 不这么做的话，一个"取消后又恢复"的报名会留下一个自相矛盾的
   * cancelled_at —— 事后看历史会以为它还是被取消的。
   */
  const isCancellation =
    parsed.data.status === "cancelled" || parsed.data.status === "late_cancelled";

  const { error } = await supabase
    .from("registrations")
    .update({
      status: parsed.data.status,
      cancelled_at: isCancellation ? new Date().toISOString() : null,
    })
    .eq("id", parsed.data.registrationId);

  if (error) {
    console.error("[admin] 修改报名状态失败:", error.message);
    return failure("修改失败，请稍后再试。");
  }

  revalidateRegistrations(registration.event_id as string);
  return {
    status: "success",
    message: `已改为「${STATUS_LABELS[parsed.data.status] ?? parsed.data.status}」。`,
  };
}

// -----------------------------------------------------------------------------
// 人工补报名（按搭档码找人）
// -----------------------------------------------------------------------------
export async function adminAddRegistrationAction(
  _prevState: FormState,
  formData: FormData,
): Promise<FormState> {
  const parsed = adminAddRegistrationSchema.safeParse({
    eventId: formData.get("eventId"),
    partnerCode: formData.get("partnerCode"),
  });
  if (!parsed.success) {
    return failure(parsed.error.issues[0]?.message ?? "请检查输入。");
  }

  const auth = await requireManager();
  if (isFailure(auth)) return auth;

  const supabase = await createUserSupabaseClient();

  // 管理员可以按码查找（函数里对管理员放行），因此不需要学生先报名
  const { data: found, error: lookupError } = await supabase.rpc("find_student_by_partner_code", {
    p_code: parsed.data.partnerCode,
    p_event: parsed.data.eventId,
  });

  if (lookupError) {
    console.error("[admin] 按搭档码查找失败:", lookupError.message);
    return failure("查找失败，请稍后再试。");
  }

  const match = found?.[0];
  if (!match) return failure("没有找到这个搭档码对应的学生。请确认号码是否正确。");

  // 可能已经有一条报名（含已取消的）—— 那就改回"已报名"，不新增第二行
  const { data: existing } = await supabase
    .from("registrations")
    .select("id")
    .eq("event_id", parsed.data.eventId)
    .eq("student_id", match.student_id)
    .maybeSingle();

  if (existing) {
    const { error } = await supabase
      .from("registrations")
      .update({ status: "registered", cancelled_at: null })
      .eq("id", existing.id);

    if (error) {
      console.error("[admin] 恢复报名失败:", error.message);
      return failure("操作失败，请稍后再试。");
    }
    revalidateRegistrations(parsed.data.eventId);
    return { status: "success", message: `已把 ${match.display_name} 恢复为「已报名」。` };
  }

  const { error } = await supabase
    .from("registrations")
    .insert({ event_id: parsed.data.eventId, student_id: match.student_id });

  if (error) {
    console.error("[admin] 人工补报名失败:", error.message);
    return failure("补报名失败，请稍后再试。");
  }

  revalidateRegistrations(parsed.data.eventId);
  return { status: "success", message: `已为 ${match.display_name} 补报名。` };
}
