"use server";

import { revalidatePath } from "next/cache";

import { generatePairingProposal } from "@/lib/admin/pairing";
import { AREA_ROLES } from "@/lib/auth/roles";
import { getSessionContext } from "@/lib/auth/session";
import type { FormState } from "@/lib/forms/form-state";
import { createUserSupabaseClient } from "@/lib/supabase/server";
import {
  confirmProposalSchema,
  dissolveTeamSchema,
  generateProposalSchema,
  moveTeamMemberSchema,
  setTeamLockSchema,
} from "@/lib/validation/pairing";

/**
 * 配对提案的管理动作（Phase 4 / P4-6）。
 *
 * 规范第 10.7 节的三条要求在这里落实：
 *   1. 管理员总能修改提案（生成、锁定、解散、确认）；
 *   2. **每一次人工改动都要被审计** ——
 *      `teams` 与 `pairing_proposals` 都有审计触发器（P4-5 已接上），
 *      因此这里不需要手写审计代码，改动的"谁、何时、改了什么"会自动记录；
 *   3. **重新生成必须保留已锁定/人工调整的分配** ——
 *      这条在 `generatePairingProposal` 里实现（生成前整体保留这类队伍）。
 */

function failure(message: string): FormState {
  return { status: "error", message };
}

async function requireManager(): Promise<{ profileId: string } | FormState> {
  const session = await getSessionContext();
  if (!session) return failure("登录状态已失效，请重新登录。");
  const allowed = AREA_ROLES.manage.some((role) => session.roles.includes(role));
  if (!allowed) return failure("只有俱乐部管理员或超级管理员可以管理配对。");
  return { profileId: session.profileId };
}

function isFailure(value: { profileId: string } | FormState): value is FormState {
  return "status" in value;
}

function revalidatePairing(eventId: string) {
  revalidatePath(`/manage/events/${eventId}/pairing`);
  revalidatePath(`/manage/events/${eventId}`);
}

/** 取得某个队伍所属的活动（用于重新验证页面）。 */
async function eventIdOfTeam(teamId: string): Promise<string | null> {
  const supabase = await createUserSupabaseClient();
  const { data } = await supabase.from("teams").select("event_id").eq("id", teamId).maybeSingle();
  return (data?.event_id as string | undefined) ?? null;
}

// -----------------------------------------------------------------------------
// 生成提案
// -----------------------------------------------------------------------------
export async function generateProposalAction(
  _prevState: FormState,
  formData: FormData,
): Promise<FormState> {
  const parsed = generateProposalSchema.safeParse({ eventId: formData.get("eventId") });
  if (!parsed.success) return failure("活动标识格式不正确。");

  const auth = await requireManager();
  if (isFailure(auth)) return auth;

  let result: Awaited<ReturnType<typeof generatePairingProposal>>;
  try {
    result = await generatePairingProposal(parsed.data.eventId);
  } catch (error) {
    // 生成过程中任何数据库读写失败都会抛到这里，而不是静默变成"没有数据"
    console.error("[admin] 生成配对提案时出错:", error instanceof Error ? error.message : error);
    return failure("生成失败。请确认活动的报名、赛制资格与偏好都已填写完整。");
  }

  if (!result.ok) return failure(result.message);

  revalidatePairing(parsed.data.eventId);

  const preserved =
    result.preservedTeamCount > 0
      ? `已保留 ${result.preservedTeamCount} 支锁定/人工调整过的队伍。`
      : "";

  return {
    status: "success",
    message:
      `已生成提案：${result.teamCount} 支队伍，${result.warningCount} 条提示。${preserved}` +
      (result.warningCount > 0 ? "请先看下面的提示再确认。" : ""),
  };
}

// -----------------------------------------------------------------------------
// 锁定 / 解锁
// -----------------------------------------------------------------------------
export async function setTeamLockAction(
  _prevState: FormState,
  formData: FormData,
): Promise<FormState> {
  const parsed = setTeamLockSchema.safeParse({
    teamId: formData.get("teamId"),
    locked: formData.get("locked"),
  });
  if (!parsed.success) return failure("队伍参数不正确。");

  const auth = await requireManager();
  if (isFailure(auth)) return auth;

  const eventId = await eventIdOfTeam(parsed.data.teamId);
  if (!eventId) return failure("找不到这支队伍。");

  const locked = parsed.data.locked === "true";
  const supabase = await createUserSupabaseClient();

  /*
   * 锁定同时把 `manually_edited` 置为 true：
   * 规范说的是"保留**已锁定/人工调整**的分配"，锁定本身就是一次人工判断。
   * 两者都标记上，重新生成时才会被保留。
   */
  const { error } = await supabase
    .from("teams")
    .update({ locked, manually_edited: true })
    .eq("id", parsed.data.teamId);

  if (error) {
    console.error("[admin] 修改队伍锁定状态失败:", error.message);
    return failure("操作失败，请稍后再试。");
  }

  revalidatePairing(eventId);
  return {
    status: "success",
    message: locked
      ? "已锁定。重新生成提案时这支队伍会被保留。"
      : "已解锁。下次重新生成时这支队伍可能被替换。",
  };
}

// -----------------------------------------------------------------------------
// 解散队伍
// -----------------------------------------------------------------------------
export async function dissolveTeamAction(
  _prevState: FormState,
  formData: FormData,
): Promise<FormState> {
  const parsed = dissolveTeamSchema.safeParse({ teamId: formData.get("teamId") });
  if (!parsed.success) return failure("队伍标识格式不正确。");

  const auth = await requireManager();
  if (isFailure(auth)) return auth;

  const eventId = await eventIdOfTeam(parsed.data.teamId);
  if (!eventId) return failure("找不到这支队伍。");

  const supabase = await createUserSupabaseClient();

  /*
   * 解散用状态标记，**不删除**记录。
   *
   * 原因：`team_members` 的外键与"一个参与最多在一支未解散队伍里"的触发器
   * 都以 `status` 为准；直接删除会丢掉"这支队伍曾经存在过"的历史，
   * 而审计日志里留下的删除记录也就失去了可对照的对象。
   */
  const { error } = await supabase
    .from("teams")
    .update({ status: "dissolved", manually_edited: true })
    .eq("id", parsed.data.teamId);

  if (error) {
    console.error("[admin] 解散队伍失败:", error.message);
    return failure("操作失败，请稍后再试。");
  }

  revalidatePairing(eventId);
  return {
    status: "success",
    message: "已解散这支队伍。相关同学的参与还在，可以重新生成或人工安排。",
  };
}

// -----------------------------------------------------------------------------
// 确认提案
// -----------------------------------------------------------------------------
export async function confirmProposalAction(
  _prevState: FormState,
  formData: FormData,
): Promise<FormState> {
  const parsed = confirmProposalSchema.safeParse({ proposalId: formData.get("proposalId") });
  if (!parsed.success) return failure("提案标识格式不正确。");

  const auth = await requireManager();
  if (isFailure(auth)) return auth;

  const supabase = await createUserSupabaseClient();

  const { data: proposal } = await supabase
    .from("pairing_proposals")
    .select("id, event_id, status")
    .eq("id", parsed.data.proposalId)
    .maybeSingle();

  if (!proposal) return failure("找不到这份提案。");
  if (proposal.status === "confirmed") return failure("这份提案已经确认过了。");

  const eventId = proposal.event_id as string;

  /*
   * 先更新提案，再更新**这份提案产生的**队伍 ——
   * 只改 `proposal_id` 匹配的队伍，避免把这份提案之外（例如上一轮遗留）的队伍一起改了。
   */
  const { error: proposalError } = await supabase
    .from("pairing_proposals")
    .update({ status: "confirmed" })
    .eq("id", parsed.data.proposalId);

  if (proposalError) {
    console.error("[admin] 确认提案失败:", proposalError.message);
    return failure("确认失败，请稍后再试。");
  }

  const { error: teamsError } = await supabase
    .from("teams")
    .update({ status: "confirmed" })
    .eq("proposal_id", parsed.data.proposalId)
    .neq("status", "dissolved");

  if (teamsError) {
    console.error("[admin] 确认队伍失败:", teamsError.message);
    return failure("提案已确认，但队伍状态更新失败，请重新确认。");
  }

  revalidatePairing(eventId);
  return { status: "success", message: "提案已确认。" };
}

// -----------------------------------------------------------------------------
// 逐人移动队员（Phase 5 / P5-7）
// -----------------------------------------------------------------------------
/**
 * 把一位学生从一支队伍移到另一支。
 *
 * 规范 10.7 第 1 条："Managers can always edit proposals before a match starts."
 * Phase 4 交付时只做了锁定/解散/重新生成，**逐人移动**是当时记录的已知缺口。
 *
 * 全部跨表条件由数据库函数 `move_team_member` 判定；
 * 应用层只负责权限与把数据库的中文错误转成可读提示。
 */
export async function moveTeamMemberAction(
  _prevState: FormState,
  formData: FormData,
): Promise<FormState> {
  const parsed = moveTeamMemberSchema.safeParse({
    fromTeamId: formData.get("fromTeamId"),
    participationId: formData.get("participationId"),
    toTeamId: formData.get("toTeamId"),
  });
  if (!parsed.success) return failure("移动参数不正确。");

  const auth = await requireManager();
  if (isFailure(auth)) return auth;

  const eventId = await eventIdOfTeam(parsed.data.fromTeamId);
  if (!eventId) return failure("找不到源队伍。");

  const supabase = await createUserSupabaseClient();
  const { error } = await supabase.rpc("move_team_member", {
    p_from_team_id: parsed.data.fromTeamId,
    p_participation_id: parsed.data.participationId,
    p_to_team_id: parsed.data.toTeamId,
  });

  if (error) {
    console.error("[admin] 移动队员失败:", error.message);
    // 数据库给出的中文原因比笼统的"失败"有用得多，尽量透传
    if (error.message.includes("名单已经锁定")) {
      return failure(
        "这两支队伍所在比赛的名单已经锁定，不能直接移动。如确需更正，请使用紧急名单更正流程。",
      );
    }
    if (error.message.includes("已经满了"))
      return failure("目标队伍已经满了，请先移出或解散其中一支。");
    if (error.message.includes("同一个活动"))
      return failure("只能在同一个活动、同一个赛制内移动队员。");
    if (error.message.includes("已经在目标队伍")) return failure("这位学生已经在目标队伍里了。");
    return failure("移动失败，请稍后再试。");
  }

  revalidatePairing(eventId);
  return { status: "success", message: "已移动这位学生。" };
}
