"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { getEventDetail } from "@/lib/admin/events";
import { AREA_ROLES } from "@/lib/auth/roles";
import { getSessionContext } from "@/lib/auth/session";
import { computeClonedSchedule } from "@/lib/domain/event-clone";
import { EVENT_STATUS_LABELS, checkEventTransition } from "@/lib/domain/event-lifecycle";
import type { FormState } from "@/lib/forms/form-state";
import { createUserSupabaseClient } from "@/lib/supabase/server";
import {
  cloneEventSchema,
  eventFormatsSchema,
  eventInputSchema,
  toEventScheduleRecord,
  transitionEventStatusSchema,
} from "@/lib/validation/events";

/**
 * 活动的特权动作：创建 / 编辑 / 克隆 / 设置活动赛制。
 *
 * 权限：`events_manage` 策略要求 `is_manager()`（俱乐部管理员或超管）。
 * 本文件另外做一次显式检查，是为了给出中文提示，而不是把数据库错误抛给用户。
 */

const NOT_AUTHORIZED = "只有俱乐部管理员或超级管理员可以管理活动。";

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

/** 把 Zod 的问题整理成"字段 → 消息"的形式，交给表单显示。 */
function toFieldErrors(issues: { path: PropertyKey[]; message: string }[]) {
  const fieldErrors: Record<string, string[]> = {};
  for (const issue of issues) {
    const key = issue.path.map(String).join(".") || "_form";
    fieldErrors[key] = [...(fieldErrors[key] ?? []), issue.message];
  }
  return fieldErrors;
}

function readEventForm(formData: FormData) {
  return {
    title: formData.get("title"),
    timezone: formData.get("timezone"),
    startsAtLocal: formData.get("startsAtLocal"),
    endsAtLocal: formData.get("endsAtLocal"),
    registrationOpensAtLocal: formData.get("registrationOpensAtLocal"),
    registrationClosesAtLocal: formData.get("registrationClosesAtLocal"),
    checkInOpensAtLocal: formData.get("checkInOpensAtLocal"),
    warningAtLocal: formData.get("warningAtLocal"),
    meetingUrl: formData.get("meetingUrl"),
    notice: formData.get("notice"),
  };
}

function revalidateEvents(eventId?: string) {
  revalidatePath("/manage/events");
  if (eventId) revalidatePath(`/manage/events/${eventId}`);
}

// -----------------------------------------------------------------------------
// 创建
// -----------------------------------------------------------------------------
export async function createEventAction(
  _prevState: FormState,
  formData: FormData,
): Promise<FormState> {
  const parsed = eventInputSchema.safeParse(readEventForm(formData));
  if (!parsed.success) {
    return failure("请检查表单内容。", toFieldErrors(parsed.error.issues));
  }

  const auth = await requireManager();
  if (isFailure(auth)) return auth;

  const supabase = await createUserSupabaseClient();
  const { data, error } = await supabase
    .from("events")
    .insert({
      ...toEventScheduleRecord(parsed.data),
      title: parsed.data.title,
      // 空字符串统一存成 NULL，避免出现 "" 与 NULL 两种"空"
      meeting_url: parsed.data.meetingUrl ? parsed.data.meetingUrl : null,
      notice: parsed.data.notice ? parsed.data.notice : null,
      status: "draft",
      created_by: auth.profileId,
    })
    .select("id")
    .single();

  if (error || !data) {
    console.error("[admin] 创建活动失败:", error?.message);
    return failure("创建活动失败，请稍后再试。");
  }

  revalidateEvents(data.id);
  // 创建成功后直接进入详情页，用户可以接着设置赛制
  redirect(`/manage/events/${data.id}`);
}

// -----------------------------------------------------------------------------
// 编辑
// -----------------------------------------------------------------------------
export async function updateEventAction(
  _prevState: FormState,
  formData: FormData,
): Promise<FormState> {
  const eventId = String(formData.get("eventId") ?? "");
  if (!/^[0-9a-f-]{36}$/i.test(eventId)) {
    return failure("活动标识格式不正确。");
  }

  const parsed = eventInputSchema.safeParse(readEventForm(formData));
  if (!parsed.success) {
    return failure("请检查表单内容。", toFieldErrors(parsed.error.issues));
  }

  const auth = await requireManager();
  if (isFailure(auth)) return auth;

  const supabase = await createUserSupabaseClient();
  const { error } = await supabase
    .from("events")
    .update({
      ...toEventScheduleRecord(parsed.data),
      title: parsed.data.title,
      meeting_url: parsed.data.meetingUrl ? parsed.data.meetingUrl : null,
      notice: parsed.data.notice ? parsed.data.notice : null,
    })
    .eq("id", eventId);

  if (error) {
    console.error("[admin] 更新活动失败:", error.message);
    return failure("保存失败，请稍后再试。");
  }

  revalidateEvents(eventId);
  return { status: "success", message: "已保存。" };
}

// -----------------------------------------------------------------------------
// 克隆
//
// 语义：以原活动为模板，新建一个**完全独立**的活动。
// 所有时间点按"新开始时间与原开始时间的差值"整体平移，保持相对安排不变。
// 活动赛制也一并复制，但是**新的行**，与原活动没有任何共享。
// -----------------------------------------------------------------------------
export async function cloneEventAction(
  _prevState: FormState,
  formData: FormData,
): Promise<FormState> {
  const parsed = cloneEventSchema.safeParse({
    eventId: formData.get("eventId"),
    title: formData.get("title"),
    startsAtLocal: formData.get("startsAtLocal"),
  });

  if (!parsed.success) {
    return failure("请检查表单内容。", toFieldErrors(parsed.error.issues));
  }

  const auth = await requireManager();
  if (isFailure(auth)) return auth;

  const source = await getEventDetail(parsed.data.eventId);
  if (!source) return failure("找不到要克隆的活动。");

  // 时间平移的计算放在纯函数里（lib/domain/event-clone.ts），可以用单元测试穷举验证。
  // 时区沿用原活动：克隆通常是把同一场活动挪到另一天，时区一般不变。
  const schedule = computeClonedSchedule(source, parsed.data.startsAtLocal);

  // shiftMinutes 只用于日志，不是数据库字段，插入前剔除
  const { shiftMinutes, ...scheduleColumns } = schedule;
  // 记一条服务端日志：排查"新活动时间怎么和我算的不一样"时，
  // 平移量是最直接的信息（客户端看不到，只留在服务端）
  console.info(`[admin] 克隆活动：源 ${parsed.data.eventId} → 新活动平移 ${shiftMinutes} 分钟`);

  const supabase = await createUserSupabaseClient();
  const { data, error } = await supabase
    .from("events")
    .insert({
      title: parsed.data.title,
      ...scheduleColumns,
      meeting_url: source.meetingUrl,
      notice: source.notice,
      // 克隆出来的活动**从草稿开始**：时间已经变了，原状态（例如"报名开放中"）
      // 对新活动没有意义，直接沿用会造成"新活动一创建就已经在报名"的误解。
      status: "draft",
      created_by: auth.profileId,
    })
    .select("id")
    .single();

  if (error || !data) {
    console.error("[admin] 克隆活动失败:", error?.message);
    return failure("克隆失败，请稍后再试。");
  }

  // 复制活动赛制（新行，不共享）
  const formatsToCopy = source.formats.map((format) => ({
    event_id: data.id,
    format_id: format.formatId,
    enabled: format.enabled,
  }));

  if (formatsToCopy.length > 0) {
    const { error: formatError } = await supabase.from("event_formats").insert(formatsToCopy);
    if (formatError) {
      // 活动已经建好，只是赛制没复制成功 —— 如实告知，让管理员手动补，
      // 而不是假装成功（那样他会以为赛制已经配好了）
      console.error("[admin] 克隆活动赛制失败:", formatError.message);
      revalidateEvents(data.id);
      return {
        status: "error",
        message: "活动已创建，但活动赛制复制失败。请在活动详情页手动设置要启用的赛制。",
      };
    }
  }

  revalidateEvents(data.id);
  redirect(`/manage/events/${data.id}`);
}

// -----------------------------------------------------------------------------
// 设置活动启用的赛制
// -----------------------------------------------------------------------------
export async function setEventFormatsAction(
  _prevState: FormState,
  formData: FormData,
): Promise<FormState> {
  const selected = formData.getAll("enabledFormatIds").map(String);
  const parsed = eventFormatsSchema.safeParse({
    eventId: formData.get("eventId"),
    enabledFormatIds: selected,
  });

  if (!parsed.success) {
    return failure("请检查表单内容。", toFieldErrors(parsed.error.issues));
  }

  const auth = await requireManager();
  if (isFailure(auth)) return auth;

  const { eventId, enabledFormatIds } = parsed.data;
  const supabase = await createUserSupabaseClient();

  // 先确保每个赛制在该活动里都有一行，再统一按勾选结果设置启用状态。
  // 用 upsert 而不是"先删后插"：删掉会丢掉该赛制的 motion（辩题），
  // 而且 upsert 不产生无意义的删除+插入审计记录。
  const { data: allFormats, error: formatError } = await supabase
    .from("debate_formats")
    .select("id")
    .order("display_order");

  if (formatError || !allFormats) {
    console.error("[admin] 读取赛制失败:", formatError?.message);
    return failure("读取赛制失败，请稍后再试。");
  }

  const enabled = new Set(enabledFormatIds);
  const rows = allFormats.map((format) => ({
    event_id: eventId,
    format_id: format.id,
    enabled: enabled.has(format.id),
  }));

  const { error } = await supabase
    .from("event_formats")
    .upsert(rows, { onConflict: "event_id,format_id" });

  if (error) {
    console.error("[admin] 保存活动赛制失败:", error.message);
    return failure("保存失败，请稍后再试。");
  }

  revalidateEvents(eventId);
  return { status: "success", message: `已保存，本活动启用了 ${enabledFormatIds.length} 个赛制。` };
}

// -----------------------------------------------------------------------------
// 推进活动状态
//
// 规范第 9.1 节："Invalid transitions return a domain error and do not
// partially mutate records."
//
// 做法：**先判断、再写入**。非法跳转在写入之前就被拒绝，因此不可能产生部分写入。
//
// 关于"为什么不在数据库里也加一道触发器"：
//   状态机的事实来源只有一处（lib/domain/event-lifecycle.ts），
//   如果再写一份 SQL 版本的跳转表，两边迟早会不一致 ——
//   那种不一致的后果是"界面允许跳、数据库拒绝"，用户看到一句数据库英文错误。
//   而"绕过应用直接改状态"在本系统里没有可行路径：
//   浏览器端**从不**直接访问数据库（有 check:browser-no-auth-service 守着），
//   所有写入都必须经过 Server Action。因此应用层强制在架构上是充分的。
// -----------------------------------------------------------------------------
export async function transitionEventStatusAction(
  _prevState: FormState,
  formData: FormData,
): Promise<FormState> {
  const parsed = transitionEventStatusSchema.safeParse({
    eventId: formData.get("eventId"),
    toStatus: formData.get("toStatus"),
  });

  if (!parsed.success) {
    return failure("活动状态参数不正确。");
  }

  const auth = await requireManager();
  if (isFailure(auth)) return auth;

  const { eventId, toStatus } = parsed.data;

  const event = await getEventDetail(eventId);
  if (!event) return failure("找不到这个活动。");

  // 先判断
  const check = checkEventTransition(event.status, toStatus);
  if (!check.ok) {
    // 这里返回的是领域错误里的中文说明，可以直接展示给用户
    return failure(check.message);
  }

  const supabase = await createUserSupabaseClient();
  const { error } = await supabase.from("events").update({ status: toStatus }).eq("id", eventId);

  if (error) {
    console.error("[admin] 推进活动状态失败:", error.message);
    return failure("状态变更失败，请稍后再试。");
  }

  revalidateEvents(eventId);
  return {
    status: "success",
    message: `活动状态已从「${EVENT_STATUS_LABELS[event.status]}」变为「${EVENT_STATUS_LABELS[toStatus]}」。`,
  };
}
