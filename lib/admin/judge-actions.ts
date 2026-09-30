"use server";

import { revalidatePath } from "next/cache";

import { getJudgeDetail } from "@/lib/admin/judges";
import { AREA_ROLES } from "@/lib/auth/roles";
import { JUDGE_APPROVAL_LABELS } from "@/lib/domain/judge-eligibility";
import { getSessionContext } from "@/lib/auth/session";
import type { FormState } from "@/lib/forms/form-state";
import { createUserSupabaseClient } from "@/lib/supabase/server";
import {
  judgeExperienceNotesSchema,
  setJudgeQualificationsSchema,
  updateJudgeApprovalSchema,
} from "@/lib/validation/judges";
import { assignJudgeSchema, cancelJudgeAssignmentSchema } from "@/lib/validation/pairing";

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

/*
 * 注意权限层级的不同：
 *   - 审批裁判、设置资格是**超级管理员**的事（`requireSuperAdmin`，Phase 2 定的）；
 *   - 把裁判**指派到某场比赛**是俱乐部管理员的日常运营（规范第 11 节：
 *     "Admin confirms the assignment"）。
 * 两者不能共用一个检查 —— 否则要么让超管被日常琐事绑住，要么让管理员能改资格。
 */
async function requireManager(): Promise<{ profileId: string } | FormState> {
  const session = await getSessionContext();
  if (!session) return failure("登录状态已失效，请重新登录。");
  const allowed = AREA_ROLES.manage.some((role) => session.roles.includes(role));
  if (!allowed) return failure("只有俱乐部管理员或超级管理员可以指派裁判。");
  return { profileId: session.profileId };
}

/** 指派改动之后要重新验证**比赛**相关页面（与裁判档案页面不同）。 */
async function revalidateJudgeViews(matchId: string) {
  const supabase = await createUserSupabaseClient();
  const { data } = await supabase
    .from("matches")
    .select("event_id")
    .eq("id", matchId)
    .maybeSingle();
  const eventId = data?.event_id as string | undefined;
  if (eventId) {
    revalidatePath(`/manage/events/${eventId}/matches`);
    revalidatePath(`/manage/events/${eventId}`);
  }
}

export async function assignJudgeAction(
  _prevState: FormState,
  formData: FormData,
): Promise<FormState> {
  const parsed = assignJudgeSchema.safeParse({
    matchId: formData.get("matchId"),
    judgeId: formData.get("judgeId"),
    role: formData.get("role"),
  });
  if (!parsed.success) return failure("指派参数不正确。");

  const auth = await requireManager();
  if (isFailure(auth)) return auth;

  const supabase = await createUserSupabaseClient();

  const { error } = await supabase.from("judge_assignments").insert({
    match_id: parsed.data.matchId,
    judge_id: parsed.data.judgeId,
    role: parsed.data.role,
    assigned_by: auth.profileId,
  });

  if (error) {
    console.error("[admin] 指派裁判失败:", error.message);
    /*
     * 最可能的原因是时间冲突触发器（P5-1 加的那条）。
     * 不把它笼统地说成"失败" —— 管理员需要知道是时间冲突，才能去改时间或换人。
     */
    if (error.message.includes("同一时间")) {
      return failure("这位裁判在同一时间已经被指派到另一场比赛了。请改时间或换一位裁判。");
    }
    if (error.message.includes("duplicate key")) {
      return failure("这位裁判已经在这场比赛里了。");
    }
    return failure("指派失败，请稍后再试。");
  }

  await revalidateJudgeViews(parsed.data.matchId);
  return { status: "success", message: "已指派裁判。" };
}

export async function cancelJudgeAssignmentAction(
  _prevState: FormState,
  formData: FormData,
): Promise<FormState> {
  const parsed = cancelJudgeAssignmentSchema.safeParse({
    assignmentId: formData.get("assignmentId"),
  });
  if (!parsed.success) return failure("指派标识格式不正确。");

  const auth = await requireManager();
  if (isFailure(auth)) return auth;

  const supabase = await createUserSupabaseClient();

  const { data: assignment } = await supabase
    .from("judge_assignments")
    .select("id, match_id, status")
    .eq("id", parsed.data.assignmentId)
    .maybeSingle();

  if (!assignment) return failure("找不到这条指派。");

  /*
   * 取消用状态标记，**不删除记录**。
   *
   * 与"解散队伍"同一个理由：`judge_assignments` 有审计触发器，
   * 删掉记录会让审计里的删除条目失去可对照的对象；
   * 而"这位裁判曾经被指派过、后来取消了"本身就是要保留的历史。
   * 另外，时间冲突触发器以 `status <> 'cancelled'` 判断占用，
   * 因此标记取消之后这位裁判立刻可以被派到别处。
   */
  const { error } = await supabase
    .from("judge_assignments")
    .update({ status: "cancelled" })
    .eq("id", parsed.data.assignmentId);

  if (error) {
    console.error("[admin] 取消裁判指派失败:", error.message);
    return failure("取消失败，请稍后再试。");
  }

  await revalidateJudgeViews(assignment.match_id as string);
  return { status: "success", message: "已取消指派。这位裁判现在可以被派到别的比赛。" };
}
