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
export async function listFormatsWithoutActiveTemplate(): Promise<FormatWithoutTemplate[]> {
  const supabase = await createUserSupabaseClient();

  const [{ data: formats, error: formatError }, { data: templates, error: templateError }] =
    await Promise.all([
      supabase.from("debate_formats").select("id, code, name, team_size").order("display_order"),
      supabase.from("ballot_templates").select("format_id").eq("active", true),
    ]);

  if (formatError) throw new Error(`读取赛制失败：${formatError.message}`);
  if (templateError) throw new Error(`读取模板失败：${templateError.message}`);

  const withTemplate = new Set((templates ?? []).map((row) => row.format_id as string));

  return (
    (formats ?? []) as unknown as { id: string; code: string; name: string; team_size: number }[]
  )
    .filter((format) => !withTemplate.has(format.id))
    .map((format) => ({
      formatId: format.id,
      code: format.code,
      name: format.name,
      teamSize: format.team_size,
    }));
}
