import "server-only";

import type { JudgeApprovalStatus, JudgeQualification } from "@/lib/domain/judge-eligibility";
import { createUserSupabaseClient } from "@/lib/supabase/server";
import type { ProfileStatus } from "@/lib/validation/admin";

/**
 * 裁判审批与资格的读取。
 *
 * 用**用户身份**的客户端（不是 service-role）：能读到谁能读到什么由 RLS 决定。
 * 裁判的 SELECT 策略允许本人或管理员查看，因此超管能看到全部。
 */

export type JudgeSummary = {
  judgeProfileId: string;
  profileId: string;
  displayName: string;
  email: string;
  profileStatus: ProfileStatus;
  approvalStatus: JudgeApprovalStatus;
  paradigm: string | null;
  qualifications: JudgeQualification[];
};

export type JudgeDetail = JudgeSummary & {
  experienceNotes: string | null;
  createdAt: string;
};

type JudgeRow = {
  id: string;
  profile_id: string;
  approval_status: string;
  paradigm: string | null;
  experience_notes: string | null;
  created_at: string;
  profiles: { id: string; display_name: string; email: string; status: string } | null;
  judge_format_qualifications: { format_id: string; approved: boolean }[] | null;
};

const JUDGE_COLUMNS =
  "id, profile_id, approval_status, paradigm, experience_notes, created_at, " +
  "profiles!inner(id, display_name, email, status), " +
  "judge_format_qualifications(format_id, approved)";

function toDetail(row: JudgeRow): JudgeDetail {
  return {
    judgeProfileId: row.id,
    profileId: row.profile_id,
    displayName: row.profiles?.display_name || row.profiles?.email || "（未知）",
    email: row.profiles?.email ?? "",
    profileStatus: (row.profiles?.status ?? "inactive") as ProfileStatus,
    approvalStatus: row.approval_status as JudgeApprovalStatus,
    paradigm: row.paradigm,
    experienceNotes: row.experience_notes,
    createdAt: row.created_at,
    qualifications: (row.judge_format_qualifications ?? [])
      .map((entry) => ({ formatId: entry.format_id, approved: entry.approved }))
      .sort((a, b) => a.formatId.localeCompare(b.formatId)),
  };
}

const LIST_LIMIT = 200;

export async function listJudges(filters: {
  approvalStatus?: JudgeApprovalStatus;
  search?: string;
}): Promise<JudgeSummary[]> {
  const supabase = await createUserSupabaseClient();

  let query = supabase
    .from("judge_profiles")
    .select(JUDGE_COLUMNS)
    .order("created_at", { ascending: false })
    .limit(LIST_LIMIT);

  if (filters.approvalStatus) query = query.eq("approval_status", filters.approvalStatus);

  const search = filters.search?.trim();
  if (search) {
    // 与用户列表同样转义通配符，避免一个 % 把结果放大
    const pattern = `%${search.replace(/[\\%_]/g, (char) => `\\${char}`)}%`;
    query = query.or(`display_name.ilike.${pattern},email.ilike.${pattern}`, {
      referencedTable: "profiles",
    });
  }

  const { data, error } = await query;
  if (error) {
    console.error("[admin] 读取裁判列表失败:", error.message);
    return [];
  }

  return (data as unknown as JudgeRow[]).map(toDetail);
}

export async function getJudgeDetail(judgeProfileId: string): Promise<JudgeDetail | null> {
  const supabase = await createUserSupabaseClient();

  const { data, error } = await supabase
    .from("judge_profiles")
    .select(JUDGE_COLUMNS)
    .eq("id", judgeProfileId)
    .maybeSingle();

  if (error) {
    console.error("[admin] 读取裁判详情失败:", error.message);
    return null;
  }
  if (!data) return null;

  return toDetail(data as unknown as JudgeRow);
}

/** 待审批裁判的数量，用于在入口页提示"有 N 个待处理"。 */
export async function countPendingJudges(): Promise<number> {
  const supabase = await createUserSupabaseClient();
  const { count, error } = await supabase
    .from("judge_profiles")
    .select("id", { count: "exact", head: true })
    .eq("approval_status", "pending");

  if (error) {
    console.error("[admin] 统计待审批裁判失败:", error.message);
    return 0;
  }
  return count ?? 0;
}
