"use server";

import { revalidatePath } from "next/cache";

import { AREA_ROLES } from "@/lib/auth/roles";
import { getSessionContext } from "@/lib/auth/session";
import { isCheckInOpen } from "@/lib/domain/registration";
import { CLUB_DEFAULT_TIMEZONE, utcToZonedLocal } from "@/lib/domain/timezone";
import type { FormState } from "@/lib/forms/form-state";
import { createUserSupabaseClient } from "@/lib/supabase/server";
import { checkInSchema, manualCheckInSchema, judgeCheckInSchema } from "@/lib/validation/check-in";

/**
 * 签到（Phase 6 / 规范第 2.8 节）。
 *
 * 规范原文："Students use a simple **Check In** action; staff can check them in manually."
 *
 * 两种情况用**不同的 `check_in_method`** 值记录（`self` / `admin`）——
 * 事后要能分清"学生自己签到的"与"管理员代签的"，这在争议时很重要。
 */

function failure(message: string): FormState {
  return { status: "error", message };
}

function revalidateLive(eventId: string) {
  revalidatePath(`/manage/events/${eventId}/live`);
  revalidatePath(`/manage/events/${eventId}`);
  revalidatePath("/student/events");
}

/** 学生自己签到。 */
export async function studentCheckInAction(
  _prevState: FormState,
  formData: FormData,
): Promise<FormState> {
  const parsed = checkInSchema.safeParse({ eventId: formData.get("eventId") });
  if (!parsed.success) return failure("活动标识格式不正确。");

  const session = await getSessionContext();
  if (!session) return failure("登录状态已失效，请重新登录。");

  const supabase = await createUserSupabaseClient();

  // 只能给自己签到：用数据库提供的安全函数取自己的学生档案 id
  const { data: studentId } = await supabase.rpc("my_student_id");
  if (!studentId) return failure("只有学生账号可以签到。");

  const { data: registration } = await supabase
    .from("registrations")
    .select("id, status, checked_in_at")
    .eq("event_id", parsed.data.eventId)
    .eq("student_id", studentId)
    .maybeSingle();

  if (!registration) return failure("你没有报名这个活动。");
  if (registration.checked_in_at) return failure("你已经签到过了。");
  if (registration.status === "cancelled" || registration.status === "late_cancelled") {
    return failure("你的报名已经取消，无法签到。请联系管理员。");
  }

  /*
   * 签到窗口（规范第 2.8 节："签到在活动开始前 30 分钟开放"）。
   *
   * ⚠️ 读的是**这次活动自己的** `check_in_opens_at`，不是"开始前 30 分钟"那个
   * 默认值 —— 管理员可以在系统设置里改掉它。
   *
   * ⚠️ 这里只是**给出能看懂的中文**。真正的保证在数据库的
   * `enforce_check_in_window` 触发器（2026-10-01）—— 绕过本文件直接调 PostgREST
   * 也签不了到。这一层存在的意义是：数据库抛出的异常对用户毫无意义。
   */
  const { data: event } = await supabase
    .from("events")
    .select("check_in_opens_at, timezone")
    .eq("id", parsed.data.eventId)
    .maybeSingle();

  if (event) {
    const checkInOpensAt = new Date(event.check_in_opens_at as string);
    if (!isCheckInOpen(checkInOpensAt, new Date())) {
      const timezone = (event.timezone as string | null) ?? CLUB_DEFAULT_TIMEZONE;
      return failure(
        `签到还没有开放。本次活动签到于 ${utcToZonedLocal(checkInOpensAt, timezone).replace("T", " ")}（${timezone}）开放。`,
      );
    }
  }

  const { error } = await supabase
    .from("registrations")
    .update({
      status: "checked_in",
      checked_in_at: new Date().toISOString(),
      check_in_method: "self",
    })
    .eq("id", registration.id);

  if (error) {
    console.error("[student] 签到失败:", error.message);
    return failure("签到失败，请稍后再试。");
  }

  revalidateLive(parsed.data.eventId);
  return { status: "success", message: "签到成功。请留意现场安排。" };
}

/** 管理员代学生签到（例如学生到了但手机没电）。 */
export async function manualCheckInAction(
  _prevState: FormState,
  formData: FormData,
): Promise<FormState> {
  const parsed = manualCheckInSchema.safeParse({
    eventId: formData.get("eventId"),
    studentId: formData.get("studentId"),
  });
  if (!parsed.success) return failure("签到参数不正确。");

  const session = await getSessionContext();
  if (!session) return failure("登录状态已失效，请重新登录。");
  if (!AREA_ROLES.manage.some((role) => session.roles.includes(role))) {
    return failure("只有俱乐部管理员或超级管理员可以代学生签到。");
  }

  const supabase = await createUserSupabaseClient();
  const { error } = await supabase
    .from("registrations")
    .update({
      status: "checked_in",
      checked_in_at: new Date().toISOString(),
      // 用不同的值记录"这是管理员代签的"，事后可区分
      check_in_method: "admin",
    })
    .eq("event_id", parsed.data.eventId)
    .eq("student_id", parsed.data.studentId)
    .is("checked_in_at", null);

  if (error) {
    console.error("[admin] 代签到失败:", error.message);
    return failure("签到失败，请稍后再试。");
  }

  revalidateLive(parsed.data.eventId);
  return { status: "success", message: "已代该学生签到。" };
}

/** 裁判签到（现场指派要求裁判已签到）。 */
export async function judgeCheckInAction(
  _prevState: FormState,
  formData: FormData,
): Promise<FormState> {
  const parsed = judgeCheckInSchema.safeParse({ judgeId: formData.get("judgeId") });
  if (!parsed.success) return failure("裁判标识格式不正确。");

  const session = await getSessionContext();
  if (!session) return failure("登录状态已失效，请重新登录。");

  const supabase = await createUserSupabaseClient();

  /*
   * 权限分两种：
   *   - 裁判可以给自己签到；
   *   - 管理员可以替任何裁判签到。
   * 用同一条更新语句，但先用一次查询确认调用者的身份。
   */
  const isManager = AREA_ROLES.manage.some((role) => session.roles.includes(role));

  const { data: judgeProfile } = await supabase
    .from("judge_profiles")
    .select("id, profile_id")
    .eq("id", parsed.data.judgeId)
    .maybeSingle();

  if (!judgeProfile) return failure("找不到这位裁判。");
  if (!isManager && judgeProfile.profile_id !== session.profileId) {
    return failure("你只能给自己签到。");
  }

  const { data: availability } = await supabase
    .from("judge_event_availability")
    .select("id, event_id, checked_in_at")
    .eq("judge_id", parsed.data.judgeId)
    .maybeSingle();

  if (!availability) return failure("这位裁判还没有在任何活动上登记可用性。");
  if (availability.checked_in_at) return failure("这位裁判已经签到过了。");

  const { error } = await supabase
    .from("judge_event_availability")
    .update({ checked_in_at: new Date().toISOString() })
    .eq("id", availability.id);

  if (error) {
    console.error("[judge] 裁判签到失败:", error.message);
    return failure("签到失败，请稍后再试。");
  }

  revalidateLive(availability.event_id as string);
  return { status: "success", message: "裁判已签到。" };
}
