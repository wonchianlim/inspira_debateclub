import "server-only";

import type { AppRole } from "@/lib/auth/roles";
import { createUserSupabaseClient } from "@/lib/supabase/server";
import type { ProfileStatus } from "@/lib/validation/admin";

/**
 * 用户与角色的读取（系统管理用）。
 *
 * ⚠️ 用的是**用户身份**的客户端，不是 service-role。
 *    因此"能读到谁"由数据库 RLS 决定，而不是靠这段代码自觉。
 *    即使这里写错了查询条件，超管以外的角色也读不到别人的档案。
 */

export type ProfileSummary = {
  id: string;
  displayName: string;
  email: string;
  status: ProfileStatus;
  roles: AppRole[];
  createdAt: string;
};

export type ProfileDetail = ProfileSummary & {
  firstName: string;
  lastName: string;
  phone: string | null;
  /** 学生档案（若该账号有学生身份） */
  studentProfile: { id: string; school: string | null; active: boolean } | null;
  /** 裁判档案（若该账号有裁判身份） */
  judgeProfile: { id: string; approvalStatus: string; paradigm: string | null } | null;
};

/**
 * 转义 LIKE 模式里的特殊字符。
 *
 * 为什么必须做：`%` 与 `_` 在 ILIKE 里是通配符。用户在搜索框里输入一个 `%`，
 * 就会匹配到所有记录 —— 这不是注入（参数仍是绑定的），但会让搜索结果完全失控。
 */
function escapeLikePattern(input: string): string {
  return input.replace(/[\\%_]/g, (char) => `\\${char}`);
}

const PROFILE_COLUMNS =
  "id, first_name, last_name, display_name, email, phone, status, created_at, user_roles(role)";

type ProfileRow = {
  id: string;
  first_name: string;
  last_name: string;
  display_name: string;
  email: string;
  phone: string | null;
  status: string;
  created_at: string;
  user_roles: { role: string }[] | null;
};

function toSummary(row: ProfileRow): ProfileSummary {
  return {
    id: row.id,
    displayName: row.display_name || row.email,
    email: row.email,
    status: row.status as ProfileStatus,
    // 排序让界面显示稳定，不依赖数据库返回顺序
    roles: (row.user_roles ?? []).map((entry) => entry.role as AppRole).sort(),
    createdAt: row.created_at,
  };
}

/** 列表最多返回这么多行：避免管理员面对一个无上限的页面。 */
const LIST_LIMIT = 200;

export async function listProfiles(filters: {
  search?: string;
  status?: ProfileStatus;
  role?: AppRole;
}): Promise<ProfileSummary[]> {
  const supabase = await createUserSupabaseClient();

  // 需要按角色筛选时用 !inner：让"含有该角色的档案"成为连接条件，
  // 否则筛选只会影响连接结果、不会过滤掉档案本身。
  const columns = filters.role
    ? PROFILE_COLUMNS.replace("user_roles(", "user_roles!inner(")
    : PROFILE_COLUMNS;

  let query = supabase
    .from("profiles")
    .select(columns)
    .order("created_at", { ascending: false })
    .limit(LIST_LIMIT);

  if (filters.status) query = query.eq("status", filters.status);
  if (filters.role) query = query.eq("user_roles.role", filters.role);

  const search = filters.search?.trim();
  if (search) {
    const pattern = `%${escapeLikePattern(search)}%`;
    query = query.or(
      `display_name.ilike.${pattern},email.ilike.${pattern},first_name.ilike.${pattern},last_name.ilike.${pattern}`,
    );
  }

  const { data, error } = await query;
  if (error) {
    console.error("[admin] 读取用户列表失败:", error.message);
    return [];
  }

  return (data as unknown as ProfileRow[]).map(toSummary);
}

export async function getProfileDetail(profileId: string): Promise<ProfileDetail | null> {
  const supabase = await createUserSupabaseClient();

  const { data, error } = await supabase
    .from("profiles")
    .select(PROFILE_COLUMNS)
    .eq("id", profileId)
    .maybeSingle();

  if (error) {
    console.error("[admin] 读取用户详情失败:", error.message);
    return null;
  }
  if (!data) return null;

  const row = data as unknown as ProfileRow;

  // 学生/裁判档案可能存在也可能不存在，分开查避免连接放大
  const [{ data: studentRow }, { data: judgeRow }] = await Promise.all([
    supabase
      .from("student_profiles")
      .select("id, school, active")
      .eq("profile_id", profileId)
      .maybeSingle(),
    supabase
      .from("judge_profiles")
      .select("id, approval_status, paradigm")
      .eq("profile_id", profileId)
      .maybeSingle(),
  ]);

  return {
    ...toSummary(row),
    firstName: row.first_name,
    lastName: row.last_name,
    phone: row.phone,
    studentProfile: studentRow
      ? { id: studentRow.id, school: studentRow.school, active: studentRow.active }
      : null,
    judgeProfile: judgeRow
      ? { id: judgeRow.id, approvalStatus: judgeRow.approval_status, paradigm: judgeRow.paradigm }
      : null,
  };
}

/**
 * 统计当前还有几个超级管理员。
 *
 * 用途：防止"最后一个超管把自己降级"导致**再也没有人能管理系统**。
 * 这种情况一旦发生，只能靠直接改数据库来救，属于应该被代码挡住的错误。
 */
export async function countSuperAdmins(): Promise<number> {
  const supabase = await createUserSupabaseClient();
  const { count, error } = await supabase
    .from("user_roles")
    .select("id", { count: "exact", head: true })
    .eq("role", "super_admin");

  if (error) {
    console.error("[admin] 统计超级管理员失败:", error.message);
    // 读不到时返回一个"看起来危险"的值，让调用方倾向于拒绝破坏性操作
    return -1;
  }
  return count ?? 0;
}
