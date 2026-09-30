import "server-only";

import { createUserSupabaseClient } from "@/lib/supabase/server";
import type { BallotTemplateSchema } from "@/lib/domain/ballot-schema";

/**
 * 评分表模板的读取（Phase 7 / P7-3）。
 *
 * 模板由**超级管理员**配置（规范第 6.6 节：schema 是配置）。
 * 这也正是 O-1 的落地方式 —— 五种赛制打哪几项、满分多少，
 * 由产品负责人在界面上填，而不是由我编进代码。
 */

export type BallotTemplateView = {
  templateId: string;
  formatId: string;
  formatCode: string;
  formatName: string;
  version: number;
  name: string;
  active: boolean;
  schema: BallotTemplateSchema;
  fieldCount: number;
  createdAt: string;
};

export type FormatWithoutTemplate = {
  formatId: string;
  code: string;
  name: string;
  teamSize: number;
};

type TemplateRow = {
  id: string;
  format_id: string;
  version: number;
  name: string;
  active: boolean;
  schema: unknown;
  created_at: string;
  debate_formats: { code: string; name: string } | null;
};

/** 列出全部模板（按赛制、版本排序）。 */
export async function listBallotTemplates(): Promise<BallotTemplateView[]> {
  const supabase = await createUserSupabaseClient();

  const { data, error } = await supabase
    .from("ballot_templates")
    .select("id, format_id, version, name, active, schema, created_at, debate_formats(code, name)")
    .order("format_id", { ascending: true })
    .order("version", { ascending: false });

  if (error) {
    console.error("[admin] 读取评分表模板失败:", error.message);
    return [];
  }

  return ((data ?? []) as unknown as TemplateRow[]).map((row) => {
    const schema = (row.schema ?? {}) as BallotTemplateSchema;
    return {
      templateId: row.id,
      formatId: row.format_id,
      formatCode: row.debate_formats?.code ?? "?",
      formatName: row.debate_formats?.name ?? "（未知赛制）",
      version: row.version,
      name: row.name,
      active: row.active,
      schema,
      fieldCount: Array.isArray(schema.fields) ? schema.fields.length : 0,
      createdAt: row.created_at,
    };
  });
}

/** 还没有任何模板的赛制 —— 界面要明确提示"这个赛制还不能打分"。 */
/**
 * 列出"还没有启用模板"的赛制。
 *
 * ⚠️ 同时返回**赛制总数**，因为调用方必须能区分这两种情况：
 *
 *   - 所有赛制都已配置模板        → 正常
 *   - **一个赛制都还没有**        → 基础数据缺失，必须提示
 *
 * 只返回"缺少模板的赛制"会让第二种情况**退化成空数组**，
 * 而空数组在调用方看来就是"没有赛制缺少模板" = "全都配好了"。
 *
 * 这个 bug 在生产上真的发生了：`supabase db push` **不执行 seed.sql**，
 * 于是生产库的 debate_formats 是空的，页面却显示"所有赛制都已配置"，
 * 同时下拉框空白、模板列表为空 —— 三个症状同一个根因。
 */
export type FormatsWithoutTemplate = {
  missing: FormatWithoutTemplate[];
  /** 库里一共有多少个赛制。为 0 表示基础数据缺失。 */
  totalFormats: number;
};

export async function listFormatsWithoutActiveTemplate(): Promise<FormatsWithoutTemplate> {
  const supabase = await createUserSupabaseClient();

  const [{ data: formats, error: formatError }, { data: templates, error: templateError }] =
    await Promise.all([
      supabase.from("debate_formats").select("id, code, name, team_size").order("display_order"),
      supabase.from("ballot_templates").select("format_id").eq("active", true),
    ]);

  if (formatError) throw new Error(`读取赛制失败：${formatError.message}`);
  if (templateError) throw new Error(`读取模板失败：${templateError.message}`);

  const withTemplate = new Set((templates ?? []).map((row) => row.format_id as string));

  const rows = (formats ?? []) as unknown as {
    id: string;
    code: string;
    name: string;
    team_size: number;
  }[];

  return {
    missing: rows
      .filter((format) => !withTemplate.has(format.id))
      .map((format) => ({
        formatId: format.id,
        code: format.code,
        name: format.name,
        teamSize: format.team_size,
      })),
    totalFormats: rows.length,
  };
}
