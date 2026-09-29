import "server-only";

import { createUserSupabaseClient } from "@/lib/supabase/server";

/**
 * 赛制读取。
 *
 * `debate_formats` 是所有登录用户可读的（策略是 `true`），
 * 因此这里用用户身份客户端读即可。
 */

export type FormatOption = {
  id: string;
  code: string;
  name: string;
  teamSize: number;
  teamsPerMatch: number;
  active: boolean;
  displayOrder: number;
};

const FORMAT_COLUMNS = "id, code, name, team_size, teams_per_match, active, display_order";

type FormatRow = {
  id: string;
  code: string;
  name: string;
  team_size: number;
  teams_per_match: number;
  active: boolean;
  display_order: number;
};

function toOption(row: FormatRow): FormatOption {
  return {
    id: row.id,
    code: row.code,
    name: row.name,
    teamSize: row.team_size,
    teamsPerMatch: row.teams_per_match,
    active: row.active,
    displayOrder: row.display_order,
  };
}

/**
 * 列出全部赛制（含已停用的）。
 *
 * 为什么把已停用的也列出来：管理员在维护"历史活动"或"某位裁判的旧资格"时，
 * 仍需要看到已停用的赛制。界面会标注哪些已停用并说明不能用于新活动。
 */
export async function listAllFormats(): Promise<FormatOption[]> {
  const supabase = await createUserSupabaseClient();

  const { data, error } = await supabase
    .from("debate_formats")
    .select(FORMAT_COLUMNS)
    .order("display_order", { ascending: true });

  if (error) {
    console.error("[admin] 读取赛制失败:", error.message);
    return [];
  }

  return (data as unknown as FormatRow[]).map(toOption);
}

/** 只列出启用中的赛制（用于"这个活动开哪些赛制"这类场景）。 */
export async function listActiveFormats(): Promise<FormatOption[]> {
  const all = await listAllFormats();
  return all.filter((format) => format.active);
}
