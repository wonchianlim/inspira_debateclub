"use server";

import { revalidatePath } from "next/cache";

import { createUserSupabaseClient } from "@/lib/supabase/server";
import { getSessionContext } from "@/lib/auth/session";
import type { FormState } from "@/lib/forms/form-state";
import {
  cancelPartnerRequestSchema,
  respondToPartnerRequestSchema,
  sendPartnerRequestSchema,
} from "@/lib/validation/partners";

/**
 * 搭档请求的动作。
 *
 * 设计要点：**前端只提交搭档码，不提交学生 id**。
 * 服务端用 SECURITY DEFINER 函数按码查找（`find_student_by_partner_code`），
 * 并且要求调用者本人也是该活动的有效参与者。
 *
 * 这样就实现了"只有对方把码告诉你，你才能找到他" —— 不存在可枚举的名单。
 */

function failure(message: string): FormState {
  return { status: "error", message };
}

async function requireStudent(): Promise<{ studentId: string } | FormState> {
  const session = await getSessionContext();
  if (!session) return failure("登录状态已失效，请重新登录。");

  const supabase = await createUserSupabaseClient();
  const { data: studentId } = await supabase.rpc("my_student_id");
  if (!studentId) return failure("只有学生账号可以发起搭档请求。");
  return { studentId: studentId as string };
}

function isFailure(value: { studentId: string } | FormState): value is FormState {
  return "status" in value;
}

function revalidatePartners(eventId: string) {
  revalidatePath(`/student/events/${eventId}`);
  revalidatePath("/student/events");
  revalidatePath("/student");
}

// -----------------------------------------------------------------------------
// 按搭档码发起请求
// -----------------------------------------------------------------------------
export async function sendPartnerRequestAction(
  _prevState: FormState,
  formData: FormData,
): Promise<FormState> {
  const parsed = sendPartnerRequestSchema.safeParse({
    eventId: formData.get("eventId"),
    partnerCode: formData.get("partnerCode"),
  });
  if (!parsed.success) {
    return failure(parsed.error.issues[0]?.message ?? "请检查输入。");
  }

  const auth = await requireStudent();
  if (isFailure(auth)) return auth;

  const supabase = await createUserSupabaseClient();

  // 按码查找。函数内部会检查"调用者本人必须是该活动的有效参与者"。
  const { data: found, error: lookupError } = await supabase.rpc("find_student_by_partner_code", {
    p_code: parsed.data.partnerCode,
    p_event: parsed.data.eventId,
  });

  if (lookupError) {
    console.error("[student] 按搭档码查找失败:", lookupError.message);
    return failure("查找失败，请稍后再试。");
  }

  // `find_student_by_partner_code` 返回的是表，因此结果是一个数组
  const match = found?.[0];
  if (!match) {
    // 刻意不区分"码不存在"与"你不是本活动参与者"以外的细节：
    // 前者是用户输入问题，后者是权限问题，两者都不该多说什么。
    return failure(
      "没有找到这个搭档码对应的同学。请确认号码是否正确；另外你必须已经报名本活动，才能邀请搭档。",
    );
  }

  if (match.student_id === auth.studentId) {
    return failure("不能邀请自己作为搭档。");
  }

  if (!match.registered_for_event) {
    // 这不构成新的信息泄露：调用方本来就持有对方的码
    return failure(`${match.display_name} 还没有报名这个活动，等他报名后再邀请吧。`);
  }

  const { error } = await supabase.from("partner_requests").insert({
    event_id: parsed.data.eventId,
    requester_student_id: auth.studentId,
    requested_student_id: match.student_id,
    status: "pending",
  });

  if (error) {
    /*
     * 最可能的原因是部分唯一索引：同一活动/赛制只能有一条**有效**请求。
     * （`pending` 与 `accepted` 算有效；被拒绝或撤回之后可以重新发起。）
     */
    console.error("[student] 发起搭档请求失败:", error.message);
    return failure("发起失败。你在这个活动上可能已经有一条尚未结束的搭档请求了。");
  }

  revalidatePartners(parsed.data.eventId);
  return { status: "success", message: `已向 ${match.display_name} 发出搭档邀请。` };
}

// -----------------------------------------------------------------------------
// 回应收到的请求
// -----------------------------------------------------------------------------
export async function respondToPartnerRequestAction(
  _prevState: FormState,
  formData: FormData,
): Promise<FormState> {
  const parsed = respondToPartnerRequestSchema.safeParse({
    requestId: formData.get("requestId"),
    decision: formData.get("decision"),
  });
  if (!parsed.success) return failure("请求参数不正确。");

  const auth = await requireStudent();
  if (isFailure(auth)) return auth;

  const supabase = await createUserSupabaseClient();

  // 先确认"我确实是被请求方"，避免替别人回应
  const { data: request } = await supabase
    .from("partner_requests")
    .select("id, event_id, requested_student_id, status")
    .eq("id", parsed.data.requestId)
    .maybeSingle();

  if (!request) return failure("找不到这条搭档请求。");
  if (request.requested_student_id !== auth.studentId) {
    return failure("只有被邀请的一方可以回应这条请求。");
  }
  if (request.status !== "pending") {
    return failure("这条请求已经被处理过了。");
  }

  const { error } = await supabase
    .from("partner_requests")
    .update({ status: parsed.data.decision })
    .eq("id", parsed.data.requestId);

  if (error) {
    console.error("[student] 回应搭档请求失败:", error.message);
    return failure("操作失败，请稍后再试。");
  }

  revalidatePartners(request.event_id as string);
  return {
    status: "success",
    message: parsed.data.decision === "accepted" ? "已接受搭档邀请。" : "已告知对方暂时无法搭档。",
  };
}

// -----------------------------------------------------------------------------
// 撤回自己发出的请求
// -----------------------------------------------------------------------------
export async function cancelPartnerRequestAction(
  _prevState: FormState,
  formData: FormData,
): Promise<FormState> {
  const parsed = cancelPartnerRequestSchema.safeParse({ requestId: formData.get("requestId") });
  if (!parsed.success) return failure("请求参数不正确。");

  const auth = await requireStudent();
  if (isFailure(auth)) return auth;

  const supabase = await createUserSupabaseClient();

  const { data: request } = await supabase
    .from("partner_requests")
    .select("id, event_id, requester_student_id, status")
    .eq("id", parsed.data.requestId)
    .maybeSingle();

  if (!request) return failure("找不到这条搭档请求。");
  if (request.requester_student_id !== auth.studentId) {
    return failure("只有发起的一方可以撤回这条请求。");
  }
  if (request.status !== "pending") {
    return failure("这条请求已经被处理过了，无法撤回。");
  }

  const { error } = await supabase
    .from("partner_requests")
    .update({ status: "cancelled" })
    .eq("id", parsed.data.requestId);

  if (error) {
    console.error("[student] 撤回搭档请求失败:", error.message);
    return failure("撤回失败，请稍后再试。");
  }

  revalidatePartners(request.event_id as string);
  return { status: "success", message: "已撤回搭档邀请。" };
}
