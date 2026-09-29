"use server";

import { revalidatePath } from "next/cache";

import { createUserSupabaseClient } from "@/lib/supabase/server";
import { getSessionContext } from "@/lib/auth/session";
import { cancellationStatus, checkRegistration } from "@/lib/domain/registration";
import type { FormState } from "@/lib/forms/form-state";
import { getStudentEventDetail } from "@/lib/student/registrations";
import {
  cancelRegistrationSchema,
  registerForEventSchema,
  saveFormatPreferencesSchema,
  type RegistrationStatus,
} from "@/lib/validation/registrations";

/**
 * 学生报名的动作。
 *
 * 三层分工（本项目的固定做法）：
 *   1. `lib/domain/registration.ts` —— 纯规则，可穷举测试；
 *   2. **本文件** —— 用纯规则给出**中文提示**，然后才写数据库；
 *   3. **数据库** —— 策略与函数是真正的保证
 *      （`registrations` 的 INSERT 要求 `is_event_registration_open`）。
 *
 * 即使本文件写错了，数据库也不会让不合规的报名落库。
 */

function failure(message: string): FormState {
  return { status: "error", message };
}

async function requireStudent(): Promise<{ profileId: string; studentId: string } | FormState> {
  const session = await getSessionContext();
  if (!session) return failure("登录状态已失效，请重新登录。");

  const supabase = await createUserSupabaseClient();
  const { data: studentId } = await supabase.rpc("my_student_id");
  if (!studentId) {
    return failure("只有学生账号可以报名。如果你认为自己应当能报名，请联系管理员。");
  }
  return { profileId: session.profileId, studentId: studentId as string };
}

function isFailure(value: { profileId: string } | FormState): value is FormState {
  return "status" in value;
}

function revalidateStudent() {
  revalidatePath("/student/events");
  revalidatePath("/student");
  revalidatePath("/events");
}

// -----------------------------------------------------------------------------
// 报名
// -----------------------------------------------------------------------------
export async function registerForEventAction(
  _prevState: FormState,
  formData: FormData,
): Promise<FormState> {
  const parsed = registerForEventSchema.safeParse({ eventId: formData.get("eventId") });
  if (!parsed.success) return failure("活动标识格式不正确。");

  const auth = await requireStudent();
  if (isFailure(auth)) return auth;

  const detail = await getStudentEventDetail(parsed.data.eventId);
  if (!detail) return failure("找不到这个活动。");

  // 用纯规则判断，给出可理解的中文提示
  const check = checkRegistration({
    window: {
      eventStatus: detail.status,
      registrationOpensAt: new Date(detail.registrationOpensAt),
      registrationClosesAt: new Date(detail.registrationClosesAt),
      now: new Date(),
    },
    existingRegistrationStatus: detail.myRegistrationStatus,
  });
  if (!check.allowed) return failure(check.message);

  const supabase = await createUserSupabaseClient();

  /*
   * 已经有报名行时走**状态回退**，不新增第二行。
   *
   * 依据 Phase 0 的 SCHEMA-D-1：取消后重新报名复用同一条记录。
   * 这也是必须的 —— `registrations` 上有 `UNIQUE (event_id, student_id)`，
   * 再插一行会直接违反约束。
   */
  if (detail.myRegistrationId) {
    const { error } = await supabase
      .from("registrations")
      .update({ status: "registered" satisfies RegistrationStatus, cancelled_at: null })
      .eq("id", detail.myRegistrationId);

    if (error) {
      console.error("[student] 恢复报名失败:", error.message);
      return failure("报名失败，请稍后再试。");
    }
  } else {
    const { error } = await supabase
      .from("registrations")
      .insert({ event_id: detail.id, student_id: auth.studentId });

    if (error) {
      console.error("[student] 报名失败:", error.message);
      return failure("报名失败，请稍后再试。");
    }
  }

  revalidateStudent();
  revalidatePath(`/student/events/${detail.id}`);
  return { status: "success", message: "报名成功。接下来可以选择你想参加的赛制。" };
}

// -----------------------------------------------------------------------------
// 取消报名
// -----------------------------------------------------------------------------
export async function cancelRegistrationAction(
  _prevState: FormState,
  formData: FormData,
): Promise<FormState> {
  const parsed = cancelRegistrationSchema.safeParse({
    registrationId: formData.get("registrationId"),
  });
  if (!parsed.success) return failure("报名标识格式不正确。");

  const auth = await requireStudent();
  if (isFailure(auth)) return auth;

  const supabase = await createUserSupabaseClient();

  // 需要活动的截止时间来判断"准时取消"还是"迟取消"
  const { data: registration, error: readError } = await supabase
    .from("registrations")
    .select("id, event_id, status, events(registration_closes_at)")
    .eq("id", parsed.data.registrationId)
    .maybeSingle();

  if (readError || !registration) {
    console.error("[student] 读取报名失败:", readError?.message);
    return failure("找不到这条报名记录。");
  }

  const closesAtRaw = (registration.events as unknown as { registration_closes_at: string } | null)
    ?.registration_closes_at;
  if (!closesAtRaw) return failure("找不到对应的活动。");

  // 复用纯函数：判定逻辑只写一处
  const nextStatus = cancellationStatus(new Date(closesAtRaw), new Date());

  const { error } = await supabase
    .from("registrations")
    .update({ status: nextStatus, cancelled_at: new Date().toISOString() })
    .eq("id", parsed.data.registrationId);

  if (error) {
    console.error("[student] 取消报名失败:", error.message);
    return failure("取消失败，请稍后再试。");
  }

  revalidateStudent();
  revalidatePath(`/student/events/${registration.event_id as string}`);

  return {
    status: "success",
    message:
      nextStatus === "late_cancelled"
        ? "已取消报名。由于已经过了报名截止时间，这次被记为「迟取消」。"
        : "已取消报名。",
  };
}

// -----------------------------------------------------------------------------
// 保存赛制偏好
// -----------------------------------------------------------------------------
export async function saveFormatPreferencesAction(
  _prevState: FormState,
  formData: FormData,
): Promise<FormState> {
  const parsed = saveFormatPreferencesSchema.safeParse({
    registrationId: formData.get("registrationId"),
    formatIds: formData.getAll("formatIds").map(String),
  });
  if (!parsed.success) return failure("提交的赛制数据不正确。");

  const auth = await requireStudent();
  if (isFailure(auth)) return auth;

  const supabase = await createUserSupabaseClient();

  /*
   * 按学生填写的**优先顺序数字**排序，而不是按复选框在页面上的先后。
   *
   * 为什么：复选框的 DOM 顺序是赛制代码的字母序，与学生心里的顺序无关。
   * 如果不按数字排序，那些"优先"输入框就纯粹是摆设 —— 学生填的顺序根本不起作用。
   * 没填数字的排在最后；数字相同则保持原有相对顺序（稳定排序）。
   */
  const orderedFormatIds = [...parsed.data.formatIds].sort((a, b) => {
    const rankOf = (formatId: string) => {
      const raw = formData.get(`priority-${formatId}`);
      const value = Number(raw);
      return Number.isFinite(value) && value > 0 ? value : Number.MAX_SAFE_INTEGER;
    };
    return rankOf(a) - rankOf(b);
  });

  // 先确认这条报名属于自己（RLS 也会拦，但提前判断能给出更好的提示）
  const { data: registration } = await supabase
    .from("registrations")
    .select("id, event_id, student_id")
    .eq("id", parsed.data.registrationId)
    .maybeSingle();

  if (!registration || registration.student_id !== auth.studentId) {
    return failure("找不到这条报名记录。");
  }

  /*
   * 保存策略：先清空再按顺序写入。
   *
   * 为什么不逐条 upsert：`preference_rank` 上有 `UNIQUE (registration_id,
   * preference_rank)`。调整顺序时（例如把第 3 名提到第 1 名）逐条更新会**中途撞上
   * 唯一约束**，因为旧的第 1 名还没让出位置。
   *
   * 代价：这是两条语句、不是原子的；若第二步失败，偏好会变成空的。
   * 取舍：偏好不是审计对象、学生可以重新保存一次，而且最终结果在 Phase 4 的
   * 配对提案快照里会保留。因此这里选择简单可靠的"先清后写"。
   */
  const { error: deleteError } = await supabase
    .from("registration_format_preferences")
    .delete()
    .eq("registration_id", parsed.data.registrationId);

  if (deleteError) {
    console.error("[student] 清空旧偏好失败:", deleteError.message);
    return failure("保存失败，请稍后再试。");
  }

  if (orderedFormatIds.length > 0) {
    const rows = orderedFormatIds.map((formatId, index) => ({
      registration_id: parsed.data.registrationId,
      format_id: formatId,
      preference_rank: index + 1,
    }));

    const { error } = await supabase.from("registration_format_preferences").insert(rows);

    if (error) {
      /*
       * 数据库会拒绝"活动没启用"或"学生不合格"的赛制（策略里调用了
       * `is_format_selectable_for_registration`），因此这里也要给出中文提示。
       */
      console.error("[student] 保存偏好失败:", error.message);
      return failure("保存失败。请确认你选择的赛制都是本活动已开设、并且你已经获得资格的赛制。");
    }
  }

  revalidatePath(`/student/events/${registration.event_id as string}`);
  revalidateStudent();
  return {
    status: "success",
    message: orderedFormatIds.length > 0 ? "偏好已保存。" : "已清空赛制偏好。",
  };
}
