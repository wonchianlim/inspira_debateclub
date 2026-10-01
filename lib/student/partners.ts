import "server-only";

import { createUserSupabaseClient } from "@/lib/supabase/server";
import type { EventStatus } from "@/lib/domain/event-lifecycle";

/**
 * 搭档请求的读取（学生视角）。
 *
 * 用**用户身份**客户端：能读到哪些请求由 RLS 决定
 * （`partner_requests_select_involved`：请求方、被请求方或管理员）。
 */

export type MyPartnerCode = {
  partnerCode: string;
};

export type PartnerRequestView = {
  id: string;
  eventId: string;
  eventTitle: string;
  /** 我在这次请求里的角色 */
  direction: "outgoing" | "incoming";
  status: keyof typeof PARTNER_STATUS_LABELS;
  /** 对方的显示名（只返回姓名，不含邮箱与评分） */
  counterpartName: string;
  counterpartSchool: string | null;
  createdAt: string;
};

export const PARTNER_STATUS_LABELS = {
  pending: "等待对方回应",
  accepted: "已接受",
  unavailable: "无法搭档",
  replaced: "已被替换",
  cancelled: "已撤回",
} as const;

/** 我自己的搭档码（用于分享给同学）。 */
export async function getMyPartnerCode(): Promise<string | null> {
  const supabase = await createUserSupabaseClient();
  const { data: studentId } = await supabase.rpc("my_student_id");
  if (!studentId) return null;

  // 学生可以读自己的 student_profiles 行（RLS 允许），因此这里能拿到自己的码
  const { data } = await supabase
    .from("student_profiles")
    .select("partner_code")
    .eq("id", studentId)
    .maybeSingle();

  return (data?.partner_code as string | undefined) ?? null;
}

type PartnerRequestRow = {
  id: string;
  event_id: string;
  status: string;
  created_at: string;
  requester_student_id: string;
  requested_student_id: string;
  events: { title: string } | null;
};

/**
 * 与我相关的搭档请求（发出的与收到的）。
 *
 * ⚠️ 只查询**姓名与学校**这两列对方信息。
 *    评分与邮箱不在这里取，也不该在别处取给同伴看（产品负责人 2026-09-29 确认）。
 */
export async function listMyPartnerRequests(): Promise<PartnerRequestView[]> {
  const supabase = await createUserSupabaseClient();
  const { data: studentId } = await supabase.rpc("my_student_id");
  if (!studentId) return [];

  const { data, error } = await supabase
    .from("partner_requests")
    .select(
      "id, event_id, status, created_at, requester_student_id, requested_student_id, events(title)",
    )
    .order("created_at", { ascending: false })
    .limit(100);

  if (error) {
    console.error("[student] 读取搭档请求失败:", error.message);
    return [];
  }

  /*
   * ⚠️ 对方的姓名与学校**不能**用 PostgREST 的嵌入查询取。
   *
   * `profiles` / `student_profiles` 的策略是行级的（只能读自己那一行），
   * 嵌入的每一行同样受约束 → 对方整行被静默过滤成 NULL，
   * 界面只能显示兜底值「（同学）」，而**不会有任何报错**。
   * 实测：以学生身份查，`partner_requests` 能看到请求，
   * 但 `profiles` 与 `student_profiles` 各只看得见自己那一行。
   *
   * 现在由 `my_partner_counterparts()` 只返回姓名与学校
   * （不含邮箱/电话），关系由函数自己判断、调用方无法指定要谁的姓名。
   */
  const { data: counterpartRows } = await supabase.rpc("my_partner_counterparts");
  const counterpartByRequest = new Map(
    (
      (counterpartRows ?? []) as {
        request_id: string;
        display_name: string | null;
        school: string | null;
      }[]
    ).map((row) => [row.request_id, row]),
  );

  return (data as unknown as PartnerRequestRow[]).map((row) => {
    const outgoing = row.requester_student_id === studentId;
    const counterpart = counterpartByRequest.get(row.id as string);
    return {
      id: row.id,
      eventId: row.event_id,
      eventTitle: row.events?.title ?? "（活动未知）",
      direction: outgoing ? "outgoing" : "incoming",
      status: row.status as keyof typeof PARTNER_STATUS_LABELS,
      counterpartName: counterpart?.display_name ?? "（同学）",
      counterpartSchool: counterpart?.school ?? null,
      createdAt: row.created_at,
    };
  });
}

/** 某场活动里与我相关的搭档请求。 */
export async function listPartnerRequestsForEvent(eventId: string): Promise<PartnerRequestView[]> {
  const all = await listMyPartnerRequests();
  return all.filter((request) => request.eventId === eventId);
}

/** 学生视角的活动摘要（用于在搭档请求里显示活动名与状态）。 */
export type PartnerEventInfo = { id: string; title: string; status: EventStatus };
