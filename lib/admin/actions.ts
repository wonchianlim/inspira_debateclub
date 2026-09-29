"use server";

import { revalidatePath } from "next/cache";

import { countSuperAdmins } from "@/lib/admin/users";
import { APP_ROLES, type AppRole } from "@/lib/auth/roles";
import { getSessionContext } from "@/lib/auth/session";
import type { FormState } from "@/lib/forms/form-state";
import { createUserSupabaseClient } from "@/lib/supabase/server";
import { setUserRolesSchema, updateProfileStatusSchema } from "@/lib/validation/admin";

/**
 * 系统管理的特权动作（主规格第 15 节 Phase 2）。
 *
 * 三层防护，缺一不可：
 *   1. **数据库 RLS**：`user_roles` 的写策略要求 `is_super_admin()`；
 *      改 `profiles.status` 由触发器要求超管。这是最后防线。
 *   2. **本文件的显式检查**：给出中文错误信息，并挡住 RLS 挡不住的业务规则
 *      （例如"不能改自己的状态"、"不能撤掉最后一个超管"）。
 *   3. **界面**：`/admin` 区域布局要求超管。这一层只是体验，不算安全。
 *
 * ⚠️ Server Action 可以被直接调用，因此**不能**只依赖"界面上看不到按钮"。
 */

const NOT_AUTHORIZED = "只有超级管理员可以执行这个操作。";

/** 统一的失败返回，避免各处文案不一致。 */
function failure(message: string, fieldErrors?: Record<string, string[]>): FormState {
  return { status: "error", message, fieldErrors };
}

// -----------------------------------------------------------------------------
// 修改账号状态
// -----------------------------------------------------------------------------
export async function updateProfileStatusAction(
  _prevState: FormState,
  formData: FormData,
): Promise<FormState> {
  const parsed = updateProfileStatusSchema.safeParse({
    profileId: formData.get("profileId"),
    status: formData.get("status"),
  });

  if (!parsed.success) {
    return failure("请检查表单内容。", {
      status: parsed.error.issues.map((issue) => issue.message),
    });
  }

  const session = await getSessionContext();
  if (!session) return failure("登录状态已失效，请重新登录。");
  if (!session.roles.includes("super_admin")) return failure(NOT_AUTHORIZED);

  const { profileId, status } = parsed.data;

  /*
   * 不允许修改**自己**的状态。
   *
   * 理由：超管把自己停用后会立刻失去管理能力，而且**没有任何其他人能把他恢复**
   * （除非还有别的超管）。这是一个很容易误触、后果又很麻烦的操作，
   * 因此直接从代码上禁止，而不是靠"操作前想清楚"。
   * 如果确实要停用某个超管账号，应由另一位超管操作。
   */
  if (profileId === session.profileId) {
    return failure("不能修改自己的账号状态。如果确实需要停用，请让另一位超级管理员操作。");
  }

  const supabase = await createUserSupabaseClient();
  const { error } = await supabase.from("profiles").update({ status }).eq("id", profileId);

  if (error) {
    console.error("[admin] 修改账号状态失败:", error.message);
    return failure("修改失败，请稍后再试。");
  }

  revalidatePath("/admin/users");
  revalidatePath(`/admin/users/${profileId}`);

  const label = { active: "正常", inactive: "已停用", suspended: "已暂停" }[status];
  return { status: "success", message: `账号状态已改为「${label}」。` };
}

// -----------------------------------------------------------------------------
// 设置账号角色（整体替换）
// -----------------------------------------------------------------------------
export async function setUserRolesAction(
  _prevState: FormState,
  formData: FormData,
): Promise<FormState> {
  // 复选框组：同名多值
  const requested = formData.getAll("roles").map(String);
  const parsed = setUserRolesSchema.safeParse({
    profileId: formData.get("profileId"),
    roles: APP_ROLES.filter((role) => requested.includes(role)),
  });

  if (!parsed.success) {
    return failure("请检查表单内容。", {
      roles: parsed.error.issues.map((issue) => issue.message),
    });
  }

  const session = await getSessionContext();
  if (!session) return failure("登录状态已失效，请重新登录。");
  if (!session.roles.includes("super_admin")) return failure(NOT_AUTHORIZED);

  const { profileId, roles: desiredRoles } = parsed.data;

  const supabase = await createUserSupabaseClient();

  const { data: currentRows, error: readError } = await supabase
    .from("user_roles")
    .select("role")
    .eq("profile_id", profileId);

  if (readError) {
    console.error("[admin] 读取现有角色失败:", readError.message);
    return failure("读取现有角色失败，请稍后再试。");
  }

  const currentRoles = new Set((currentRows ?? []).map((row) => row.role as AppRole));
  const desired = new Set<AppRole>(desiredRoles);

  const toAdd = [...desired].filter((role) => !currentRoles.has(role));
  const toRemove = [...currentRoles].filter((role) => !desired.has(role));

  /*
   * 不允许撤掉**最后一个**超级管理员。
   *
   * 一旦系统里没有任何超管，就再也没有人能授予角色或修改系统设置 ——
   * 只能直接改数据库才能恢复。与其等出事，不如在这里挡住。
   */
  if (toRemove.includes("super_admin")) {
    const remaining = await countSuperAdmins();
    if (remaining >= 0 && remaining <= 1) {
      return failure("不能撤掉最后一个超级管理员。请先授予其他人超级管理员身份，再撤销这一个。");
    }
  }

  if (toAdd.length > 0) {
    const { error } = await supabase
      .from("user_roles")
      .insert(toAdd.map((role) => ({ profile_id: profileId, role })));
    if (error) {
      console.error("[admin] 授予角色失败:", error.message);
      return failure("授予角色失败，请稍后再试。");
    }
  }

  if (toRemove.length > 0) {
    const { error } = await supabase
      .from("user_roles")
      .delete()
      .eq("profile_id", profileId)
      .in("role", toRemove);
    if (error) {
      console.error("[admin] 撤销角色失败:", error.message);
      return failure("撤销角色失败，请稍后再试。");
    }
  }

  revalidatePath("/admin/users");
  revalidatePath(`/admin/users/${profileId}`);

  const added = toAdd.length;
  const removed = toRemove.length;
  if (added === 0 && removed === 0) {
    return { status: "success", message: "角色没有变化。" };
  }

  return {
    status: "success",
    message: `角色已更新：新增 ${added} 个、撤销 ${removed} 个。`,
  };
}
