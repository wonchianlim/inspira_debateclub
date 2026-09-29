import "server-only";

import { createUserSupabaseClient } from "@/lib/supabase/server";

/**
 * 审计日志的读取（系统管理用）。
 *
 * ⚠️ 只读。审计表没有任何 UPDATE / DELETE 策略，
 *    并且 Phase 1 已显式 `REVOKE UPDATE/DELETE/TRUNCATE`，
 *    Phase 1 的 F-MGR-02 与 F-ALL-01 用例证明连超管也改不了、删不了。
 *    因此这个页面**没有任何编辑入口** —— 不是"忘了做"，是设计如此。
 */

export type AuditEntry = {
  id: string;
  actorProfileId: string | null;
  /** 操作者显示名；操作者账号被删除时为 null（审计记录会保留，只是不再指向具体人） */
  actorName: string | null;
  entityType: string;
  entityId: string;
  action: string;
  oldValue: unknown;
  newValue: unknown;
  createdAt: string;
};

type AuditRow = {
  id: string;
  actor_profile_id: string | null;
  entity_type: string;
  entity_id: string;
  action: string;
  old_value: unknown;
  new_value: unknown;
  created_at: string;
  profiles: { display_name: string; email: string } | null;
};

const AUDIT_COLUMNS =
  "id, actor_profile_id, entity_type, entity_id, action, old_value, new_value, created_at, " +
  "profiles(display_name, email)";

const LIST_LIMIT = 100;

/** 数据库里的英文动作名 → 中文。未知动作原样显示，不隐藏。 */
export const AUDIT_ACTION_LABELS: Record<string, string> = {
  insert: "新增",
  update: "修改",
  delete: "删除",
};

/** 被审计的表 → 中文。未知表名原样显示。 */
export const AUDIT_ENTITY_LABELS: Record<string, string> = {
  profiles: "用户档案",
  user_roles: "账号角色",
  student_profiles: "学生档案",
  judge_profiles: "裁判档案",
  student_format_profiles: "学生赛制档案",
  judge_format_qualifications: "裁判赛制资格",
  debate_formats: "赛制",
  format_positions: "赛制位置",
  events: "活动",
  event_formats: "活动赛制",
  notices: "通知",
  system_settings: "系统设置",
};

export async function listAuditEntries(
  filters: {
    entityType?: string;
    action?: string;
  } = {},
): Promise<AuditEntry[]> {
  const supabase = await createUserSupabaseClient();

  let query = supabase
    .from("audit_logs")
    .select(AUDIT_COLUMNS)
    .order("created_at", { ascending: false })
    .limit(LIST_LIMIT);

  if (filters.entityType) query = query.eq("entity_type", filters.entityType);
  if (filters.action) query = query.eq("action", filters.action);

  const { data, error } = await query;
  if (error) {
    console.error("[admin] 读取审计日志失败:", error.message);
    return [];
  }

  return (data as unknown as AuditRow[]).map((row) => ({
    id: row.id,
    actorProfileId: row.actor_profile_id,
    actorName: row.profiles?.display_name ?? row.profiles?.email ?? null,
    entityType: row.entity_type,
    entityId: row.entity_id,
    action: row.action,
    oldValue: row.old_value,
    newValue: row.new_value,
    createdAt: row.created_at,
  }));
}

/** 出现过哪些实体类型与动作，用于生成筛选下拉项。 */
export async function listAuditFacets(): Promise<{ entityTypes: string[]; actions: string[] }> {
  const entries = await listAuditEntries();
  return {
    entityTypes: [...new Set(entries.map((entry) => entry.entityType))].sort(),
    actions: [...new Set(entries.map((entry) => entry.action))].sort(),
  };
}
