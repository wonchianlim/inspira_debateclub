import "server-only";

import { createUserSupabaseClient } from "@/lib/supabase/server";
import type { AdminRegistrationStatus } from "@/lib/validation/admin-registrations";

/**
 * 管理员视角的报名读取（Phase 3 / P3-6）。
 *
 * 用**用户身份**客户端：`registrations` 的 `registrations_manage` 策略要求
 * `is_manager()`，因此能读到全部报名由数据库决定。
 */

export type RegistrationIssue =
  /** 报了名但一个赛制偏好都没填 —— 配对时无法判断他该去哪个赛制 */
  | "no_preferences"
  /** 报了名，但本活动没有任何他合格的赛制 —— 他报不上任何一场，需要人工处理 */
  | "no_eligible_format";

export type EventRegistrationRow = {
  registrationId: string;
  studentId: string;
  studentName: string;
  school: string | null;
  status: AdminRegistrationStatus;
  registeredAt: string;
  cancelledAt: string | null;
  /** 已填写的赛制偏好数量 */
  preferenceCount: number;
  /** 本活动已启用、且该学生合格的赛制数量 */
  eligibleFormatCount: number;
  /** 需要管理员在配对前处理的问题 */
  issues: RegistrationIssue[];
};

const ISSUE_LABELS: Record<RegistrationIssue, string> = {
  no_preferences: "未填写赛制偏好",
  no_eligible_format: "没有他合格的赛制",
};

export function registrationIssueLabel(issue: RegistrationIssue): string {
  return ISSUE_LABELS[issue];
}

type RegistrationRaw = {
  id: string;
  student_id: string;
  status: string;
  registered_at: string;
  cancelled_at: string | null;
  student_profiles: {
    id: string;
    school: string | null;
    profiles: { display_name: string } | null;
  } | null;
};

export async function listEventRegistrations(eventId: string): Promise<EventRegistrationRow[]> {
  const supabase = await createUserSupabaseClient();

  const [{ data: registrations, error }, { data: eventFormats }] = await Promise.all([
    supabase
      .from("registrations")
      .select(
        "id, student_id, status, registered_at, cancelled_at, " +
          "student_profiles!inner(id, school, profiles!inner(display_name))",
      )
      .eq("event_id", eventId)
      .order("registered_at", { ascending: true })
      .limit(500),
    supabase.from("event_formats").select("format_id").eq("event_id", eventId).eq("enabled", true),
  ]);

  if (error) {
    console.error("[admin] 读取报名失败:", error.message);
    return [];
  }

  const rows = (registrations ?? []) as unknown as RegistrationRaw[];
  if (rows.length === 0) return [];

  const studentIds = rows.map((row) => row.student_id);
  const enabledFormatIds = (eventFormats ?? []).map((row) => row.format_id as string);

  // 资格、偏好分别一次查出来，再在内存里合并 —— 比三层嵌套连接更好读，也避免连接放大
  const [{ data: formatProfiles }, { data: preferences }] = await Promise.all([
    supabase
      .from("student_format_profiles")
      .select("student_id, format_id, eligible")
      .in("student_id", studentIds),
    supabase
      .from("registration_format_preferences")
      .select("registration_id")
      .in(
        "registration_id",
        rows.map((row) => row.id),
      ),
  ]);

  const eligibleByStudent = new Map<string, Set<string>>();
  for (const entry of formatProfiles ?? []) {
    if (!entry.eligible) continue;
    const set = eligibleByStudent.get(entry.student_id as string) ?? new Set<string>();
    set.add(entry.format_id as string);
    eligibleByStudent.set(entry.student_id as string, set);
  }

  const preferenceCountByRegistration = new Map<string, number>();
  for (const entry of preferences ?? []) {
    const key = entry.registration_id as string;
    preferenceCountByRegistration.set(key, (preferenceCountByRegistration.get(key) ?? 0) + 1);
  }

  return rows.map((row) => {
    const eligible = eligibleByStudent.get(row.student_id) ?? new Set<string>();
    // 只统计"本活动已启用"的赛制
    const eligibleFormatCount = enabledFormatIds.filter((formatId) =>
      eligible.has(formatId),
    ).length;
    const preferenceCount = preferenceCountByRegistration.get(row.id) ?? 0;

    const issues: RegistrationIssue[] = [];
    /*
     * 只在"仍然有效"的报名上提示问题。
     * 已经取消的人不需要补偏好 —— 那会制造一堆无意义的待办。
     */
    const isActive = row.status === "registered" || row.status === "checked_in";
    if (isActive) {
      if (eligibleFormatCount === 0) issues.push("no_eligible_format");
      if (preferenceCount === 0) issues.push("no_preferences");
    }

    return {
      registrationId: row.id,
      studentId: row.student_id,
      studentName: row.student_profiles?.profiles?.display_name ?? "（未知）",
      school: row.student_profiles?.school ?? null,
      status: row.status as AdminRegistrationStatus,
      registeredAt: row.registered_at,
      cancelledAt: row.cancelled_at,
      preferenceCount,
      eligibleFormatCount,
      issues,
    };
  });
}
