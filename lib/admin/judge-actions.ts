"use server";

import { revalidatePath } from "next/cache";

import { getJudgeDetail } from "@/lib/admin/judges";
import { JUDGE_APPROVAL_LABELS } from "@/lib/domain/judge-eligibility";
import { getSessionContext } from "@/lib/auth/session";
import type { FormState } from "@/lib/forms/form-state";
import { createUserSupabaseClient } from "@/lib/supabase/server";
import {
  judgeExperienceNotesSchema,
  setJudgeQualificationsSchema,
  updateJudgeApprovalSchema,
} from "@/lib/validation/judges";

/**
 * 裁判审批与赛制资格的特权动作。
 *
 * 权限由两层保证：
 *   1. **数据库**：改审批状态由触发器要求超管；写资格由 RLS 策略要求超管。
 *   2. **本文件**：给出中文错误信息，并保证操作本身的语义正确。
 *
 * 每次改动都会被 P2-2 的审计触发器自动记录（含操作者与前后值）。
 */

const NOT_AUTHORIZED = "只有超级管理员可以审批裁判或维护裁判资格。";

function failure(message: string, fieldErrors?: Record<string, string[]>): FormState {
  return { status: "error", message, fieldErrors };
}

/** 只有超管可以执行；否则返回可展示的失败结果。 */
async function requireSuperAdmin(): Promise<{ profileId: string } | FormState> {
  const session = await getSessionContext();
  if (!session) return failure("登录状态已失效，请重新登录。");
  if (!session.roles.includes("super_admin")) return failure(NOT_AUTHORIZED);
  return { profileId: session.profileId };
}

function isFailure(value: { profileId: string } | FormState): value is FormState {
  return "status" in value;
}

function revalidateJudge(judgeProfileId: string) {
  revalidatePath("/admin/judges");
  revalidatePath(`/admin/judges/${judgeProfileId}`);
  revalidatePath("/admin");
}

// -----------------------------------------------------------------------------
// 审批状态：待审批 / 已批准 / 已拒绝 / 已暂停
// -----------------------------------------------------------------------------
export async function updateJudgeApprovalAction(
  _prevState: FormState,
  formData: FormData,
): Promise<FormState> {
  const parsed = updateJudgeApprovalSchema.safeParse({
    judgeProfileId: formData.get("judgeProfileId"),
    approvalStatus: formData.get("approvalStatus"),
  });

  if (!parsed.success) {
    return failure("请检查表单内容。", {
      approvalStatus: parsed.error.issues.map((issue) => issue.message),
    });
  }

  const auth = await requireSuperAdmin();
  if (isFailure(auth)) return auth;

  const { judgeProfileId, approvalStatus } = parsed.data;
  const supabase = await createUserSupabaseClient();

  const { error } = await supabase
    .from("judge_profiles")
    .update({ approval_status: approvalStatus })
    .eq("id", judgeProfileId);

  if (error) {
    console.error("[admin] 修改裁判审批状态失败:", error.message);
    return failure("修改失败，请稍后再试。");
  }

  revalidateJudge(judgeProfileId);
  return {
    status: "success",
    message: `审批状态已改为「${JUDGE_APPROVAL_LABELS[approvalStatus]}」。`,
  };
}

// -----------------------------------------------------------------------------
// 赛制资格
//
// 表单提交的是"该裁判**已获批准**的赛制"集合。未勾选的赛制会被置为"未获资格"。
// 刻意**不删除**资格行：保留行可以留下"曾经获过资格"的痕迹，
// 而审计日志也会记录这次变更的前后值。
// -----------------------------------------------------------------------------
export async function setJudgeQualificationsAction(
  _prevState: FormState,
  formData: FormData,
): Promise<FormState> {
  const selected = formData.getAll("formatIds").map(String);
  const parsed = setJudgeQualificationsSchema.safeParse({
    judgeProfileId: formData.get("judgeProfileId"),
    formatIds: selected,
  });

  if (!parsed.success) {
    return failure("请检查表单内容。", {
      formatIds: parsed.error.issues.map((issue) => issue.message),
    });
  }

  const auth = await requireSuperAdmin();
  if (isFailure(auth)) return auth;

  const { judgeProfileId, formatIds } = parsed.data;
  const desired = new Set(formatIds);

  const judge = await getJudgeDetail(judgeProfileId);
  if (!judge) return failure("找不到这位裁判。");

  const supabase = await createUserSupabaseClient();

  // 1) 勾选的赛制：插入或更新为"已批准"
  if (desired.size > 0) {
    const rows = [...desired].map((formatId) => ({
      judge_id: judgeProfileId,
      format_id: formatId,
      approved: true,
      approved_by: auth.profileId,
      approved_at: new Date().toISOString(),
    }));

    const { error } = await supabase
      .from("judge_format_qualifications")
      .upsert(rows, { onConflict: "judge_id,format_id" });

    if (error) {
      console.error("[admin] 授予裁判资格失败:", error.message);
      return failure("保存资格失败，请稍后再试。");
    }
  }

  // 2) 取消勾选、但原先已批准的赛制：改为"未批准"并清空批准信息
  const toRevoke = judge.qualifications
    .filter((entry) => entry.approved && !desired.has(entry.formatId))
    .map((entry) => entry.formatId);

  if (toRevoke.length > 0) {
    const { error } = await supabase
      .from("judge_format_qualifications")
      .update({ approved: false, approved_by: null, approved_at: null })
      .eq("judge_id", judgeProfileId)
      .in("format_id", toRevoke);

    if (error) {
      console.error("[admin] 撤销裁判资格失败:", error.message);
      return failure("撤销资格失败，请稍后再试。");
    }
  }

  revalidateJudge(judgeProfileId);

  const granted = formatIds.filter(
    (formatId) =>
      !judge.qualifications.some((entry) => entry.formatId === formatId && entry.approved),
  ).length;
  const revoked = toRevoke.length;

  if (granted === 0 && revoked === 0) {
    return { status: "success", message: "赛制资格没有变化。" };
  }

  return {
    status: "success",
    message: `赛制资格已更新：新增 ${granted} 个、撤销 ${revoked} 个。`,
  };
}

// -----------------------------------------------------------------------------
// 裁判范式与经验备注
// -----------------------------------------------------------------------------
export async function updateJudgeNotesAction(
  _prevState: FormState,
  formData: FormData,
): Promise<FormState> {
  const parsed = judgeExperienceNotesSchema.safeParse({
    judgeProfileId: formData.get("judgeProfileId"),
    paradigm: formData.get("paradigm") ?? undefined,
    experienceNotes: formData.get("experienceNotes") ?? undefined,
  });

  if (!parsed.success) {
    return failure("请检查表单内容。", {
      paradigm: parsed.error.issues
        .filter((issue) => issue.path.join(".") === "paradigm")
        .map((issue) => issue.message),
      experienceNotes: parsed.error.issues
        .filter((issue) => issue.path.join(".") === "experienceNotes")
        .map((issue) => issue.message),
    });
  }

  const auth = await requireSuperAdmin();
  if (isFailure(auth)) return auth;

  const { judgeProfileId, paradigm, experienceNotes } = parsed.data;
  const supabase = await createUserSupabaseClient();

  const { error } = await supabase
    .from("judge_profiles")
    .update({
      // 空字符串统一存成 NULL，避免出现 "" 与 NULL 两种"空"
      paradigm: paradigm ? paradigm : null,
      experience_notes: experienceNotes ? experienceNotes : null,
    })
    .eq("id", judgeProfileId);

  if (error) {
    console.error("[admin] 保存裁判备注失败:", error.message);
    return failure("保存失败，请稍后再试。");
  }

  revalidateJudge(judgeProfileId);
  return { status: "success", message: "已保存。" };
}
