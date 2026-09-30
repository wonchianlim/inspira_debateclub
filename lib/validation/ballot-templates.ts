import { z } from "zod";

import {
  BALLOT_FIELD_SCOPES,
  BALLOT_FIELD_TYPES,
  type BallotField,
  type BallotTemplateSchema,
} from "@/lib/domain/ballot-schema";

/**
 * 评分表模板的输入校验（Phase 7 / 规范第 6.6 节）。
 *
 * 这一层只做**格式与类型**校验；"字段键是否重复""分数区间是否给全"
 * 这类**业务**校验由 `validateBallotTemplate()` 负责 ——
 * 因为那些规则要给出**具体的中文说明**，而不是泛泛的"格式错误"。
 *
 * ⚠️ 界面上传的是一个字段数组的 JSON 字符串（由客户端表单序列化）。
 *    因此这里先解析、再逐项校验；解析失败要给出可读的原因。
 */

export const ballotFieldSchema = z.object({
  key: z
    .string()
    .trim()
    .min(1, { error: "字段键不能为空" })
    .max(40, { error: "字段键最多 40 个字符" }),
  label: z.string().trim().min(1, { error: "显示名称不能为空" }).max(60),
  type: z.enum(BALLOT_FIELD_TYPES, { error: "字段类型不正确" }),
  scope: z.enum(BALLOT_FIELD_SCOPES, { error: "作用范围不正确" }),
  required: z.boolean(),
  // 分数区间：只有 score 类型才需要，由配置的人给出
  min: z.number().optional(),
  max: z.number().optional(),
  step: z.number().positive().optional(),
  help: z.string().trim().max(200).optional(),
});

export const ballotTemplateSchemaInput = z.object({
  formatId: z.guid({ error: "赛制标识格式不正确" }),
  name: z.string().trim().min(1, { error: "模板名称不能为空" }).max(80),
  fieldsJson: z.string().min(2, { error: "至少要有一个字段" }),
  winnerRequired: z.boolean(),
  reasonForDecisionRequired: z.boolean(),
});

export const toggleTemplateSchema = z.object({
  templateId: z.guid({ error: "模板标识格式不正确" }),
  active: z.enum(["true", "false"]),
});

/** 把界面传来的字段 JSON 解析成字段数组，失败时给出可读原因。 */
export function parseFieldsJson(
  fieldsJson: string,
): { ok: true; fields: BallotField[] } | { ok: false; message: string } {
  let parsed: unknown;
  try {
    parsed = JSON.parse(fieldsJson);
  } catch {
    return { ok: false, message: "字段内容不是合法的数据格式，请检查是否误改了内容。" };
  }

  if (!Array.isArray(parsed)) {
    return { ok: false, message: "字段内容必须是一个列表。" };
  }

  const fields: BallotField[] = [];
  for (const [index, raw] of parsed.entries()) {
    const result = ballotFieldSchema.safeParse(raw);
    if (!result.success) {
      const first = result.error.issues[0];
      return {
        ok: false,
        message: `第 ${index + 1} 个字段有问题：${first?.message ?? "格式不正确"}`,
      };
    }
    const value = result.data;
    fields.push({
      key: value.key,
      label: value.label,
      type: value.type,
      scope: value.scope,
      required: value.required,
      // 只保留有意义的可选值：非分数字段带 min/max 会让 schema 变得含混
      ...(value.type === "score" ? { min: value.min, max: value.max, step: value.step } : {}),
      ...(value.help ? { help: value.help } : {}),
    });
  }

  return { ok: true, fields };
}

/** 组装成完整的模板 schema。 */
export function buildTemplateSchema(
  fields: BallotField[],
  options: { winnerRequired: boolean; reasonForDecisionRequired: boolean },
): BallotTemplateSchema {
  return {
    schemaVersion: 1,
    fields,
    winnerRequired: options.winnerRequired,
    reasonForDecisionRequired: options.reasonForDecisionRequired,
  };
}

/**
 * 供界面提示用。
 *
 * ⚠️ 这个常量**不能**放在 `lib/admin/ballot-template-actions.ts` 里 ——
 * 那个文件有 `"use server"`，而它**只允许导出 async 函数**。
 * 放了会直接构建失败（Phase 2 在 `INITIAL_AUTH_STATE` 上踩过同一个坑）。
 */
export const TEMPLATE_PERMISSION_NOTE =
  "评分表模板决定之后所有裁判能打哪些分，因此只有超级管理员可以修改。";
