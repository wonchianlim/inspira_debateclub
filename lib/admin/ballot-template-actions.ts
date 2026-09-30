"use server";

import { revalidatePath } from "next/cache";

import { getSessionContext } from "@/lib/auth/session";
import { validateBallotTemplate } from "@/lib/domain/ballot-schema";
import type { FormState } from "@/lib/forms/form-state";
import { createUserSupabaseClient } from "@/lib/supabase/server";
import {
  ballotTemplateSchemaInput,
  buildTemplateSchema,
  parseFieldsJson,
  toggleTemplateSchema,
} from "@/lib/validation/ballot-templates";

/**
 * 评分表模板的管理动作（Phase 7 / P7-3）。
 *
 * ⚠️ 权限是**超级管理员**，不是普通管理员。
 *
 * 理由：模板决定了之后**所有裁判**能打哪些分、分数区间是多少。
 * 改错一次会让整个比赛的评分不可信，因此规范把 schema 定位为"配置"，
 * 与"设置赛制资格"同级 —— 那在 Phase 2 就已经定为超管权限。
 */

function failure(message: string): FormState {
  return { status: "error", message };
}

async function requireSuperAdmin(): Promise<{ profileId: string } | FormState> {
  const session = await getSessionContext();
  if (!session) return failure("登录状态已失效，请重新登录。");
  if (!session.roles.includes("super_admin")) {
    return failure("只有超级管理员可以配置评分表模板。");
  }
  return { profileId: session.profileId };
}

function isFailure(value: { profileId: string } | FormState): value is FormState {
  return "status" in value;
}

function revalidateTemplates() {
  revalidatePath("/admin/ballot-templates");
  revalidatePath("/admin");
}

/**
 * 新建一个模板版本。
 *
 * 版本号自动取"该赛制当前最大版本 + 1" —— 规范要求模板是**版本化**的，
 * 因为已经提交过的评分表必须能对应回它当时用的模板。
 * 因此这里**不修改**旧版本，而是新建一版。
 */
export async function createBallotTemplateAction(
  _prevState: FormState,
  formData: FormData,
): Promise<FormState> {
  const parsed = ballotTemplateSchemaInput.safeParse({
    formatId: formData.get("formatId"),
    name: formData.get("name"),
    fieldsJson: formData.get("fieldsJson"),
    winnerRequired: formData.get("winnerRequired") === "on",
    reasonForDecisionRequired: formData.get("reasonForDecisionRequired") === "on",
  });
  if (!parsed.success) {
    return failure(parsed.error.issues[0]?.message ?? "请检查输入。");
  }

  const auth = await requireSuperAdmin();
  if (isFailure(auth)) return auth;

  const fieldsResult = parseFieldsJson(parsed.data.fieldsJson);
  if (!fieldsResult.ok) return failure(fieldsResult.message);

  const schema = buildTemplateSchema(fieldsResult.fields, {
    winnerRequired: parsed.data.winnerRequired,
    reasonForDecisionRequired: parsed.data.reasonForDecisionRequired,
  });

  // 业务校验：字段键重复、分数字段缺区间、类型无法识别等
  const validation = validateBallotTemplate(schema);
  if (!validation.valid) {
    return failure(validation.issues.map((issue) => issue.message).join("；"));
  }

  const supabase = await createUserSupabaseClient();

  const { data: latest } = await supabase
    .from("ballot_templates")
    .select("version")
    .eq("format_id", parsed.data.formatId)
    .order("version", { ascending: false })
    .limit(1)
    .maybeSingle();

  const nextVersion = ((latest?.version as number | undefined) ?? 0) + 1;

  /*
   * 新版本建好之后，把该赛制**旧的活跃模板**停用。
   *
   * 为什么不是直接改旧模板：规范要求模板**版本化**，
   * 而已经提交的评分表要能对应回它当时用的那一版。
   * 改旧模板会让历史评分表的解释发生变化。
   */
  const { error: deactivateError } = await supabase
    .from("ballot_templates")
    .update({ active: false })
    .eq("format_id", parsed.data.formatId)
    .eq("active", true);
  if (deactivateError) {
    console.error("[admin] 停用旧模板失败:", deactivateError.message);
    return failure("保存失败，请稍后再试。");
  }

  const { error } = await supabase.from("ballot_templates").insert({
    format_id: parsed.data.formatId,
    version: nextVersion,
    name: parsed.data.name,
    // 走一次 JSON 序列化得到纯 JSON 值，避免手写 Json 类型断言（断言写错不会被发现）
    schema: JSON.parse(JSON.stringify(schema)) as never,
    active: true,
    created_by: auth.profileId,
  });

  if (error) {
    console.error("[admin] 新建评分表模板失败:", error.message);
    return failure("保存失败，请稍后再试。");
  }

  revalidateTemplates();
  return {
    status: "success",
    message: `已保存为第 ${nextVersion} 版，并设为该赛制当前使用的模板。旧版本仍保留，历史评分表不受影响。`,
  };
}

/** 启用 / 停用某个模板。 */
export async function toggleBallotTemplateAction(
  _prevState: FormState,
  formData: FormData,
): Promise<FormState> {
  const parsed = toggleTemplateSchema.safeParse({
    templateId: formData.get("templateId"),
    active: formData.get("active"),
  });
  if (!parsed.success) return failure("模板参数不正确。");

  const auth = await requireSuperAdmin();
  if (isFailure(auth)) return auth;

  const supabase = await createUserSupabaseClient();
  const active = parsed.data.active === "true";

  const { data: template } = await supabase
    .from("ballot_templates")
    .select("id, format_id")
    .eq("id", parsed.data.templateId)
    .maybeSingle();
  if (!template) return failure("找不到这个模板。");

  // 启用某一版时，先把同赛制的其他版本停用 —— 一个赛制同时只有一个活跃模板
  if (active) {
    const { error: deactivateError } = await supabase
      .from("ballot_templates")
      .update({ active: false })
      .eq("format_id", template.format_id as string)
      .eq("active", true);
    if (deactivateError) {
      console.error("[admin] 停用同赛制其他模板失败:", deactivateError.message);
      return failure("操作失败，请稍后再试。");
    }
  }

  const { error } = await supabase
    .from("ballot_templates")
    .update({ active })
    .eq("id", parsed.data.templateId);

  if (error) {
    console.error("[admin] 切换模板状态失败:", error.message);
    return failure("操作失败，请稍后再试。");
  }

  revalidateTemplates();
  return {
    status: "success",
    message: active ? "已设为该赛制当前使用的模板。" : "已停用这个模板。",
  };
}
