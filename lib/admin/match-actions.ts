"use server";

import { revalidatePath } from "next/cache";

import { generateAndSaveMatches } from "@/lib/admin/matches";
import { AREA_ROLES } from "@/lib/auth/roles";
import { getSessionContext } from "@/lib/auth/session";
import type { FormState } from "@/lib/forms/form-state";
import { createUserSupabaseClient } from "@/lib/supabase/server";
import { z } from "zod";

/**
 * 比赛相关的管理动作（Phase 5 / P5-6）。
 *
 * 每一次改动都会被审计（`matches` 与 `match_teams` 在 P5-1 就挂了审计触发器）。
 */

const eventIdSchema = z.object({ eventId: z.guid({ error: "活动标识格式不正确" }) });
const matchIdSchema = z.object({ matchId: z.guid({ error: "比赛标识格式不正确" }) });

function failure(message: string): FormState {
  return { status: "error", message };
}

async function requireManager(): Promise<{ profileId: string } | FormState> {
  const session = await getSessionContext();
  if (!session) return failure("登录状态已失效，请重新登录。");
  const allowed = AREA_ROLES.manage.some((role) => session.roles.includes(role));
  if (!allowed) return failure("只有俱乐部管理员或超级管理员可以安排比赛。");
  return { profileId: session.profileId };
}

function isFailure(value: { profileId: string } | FormState): value is FormState {
  return "status" in value;
}

function revalidateMatches(eventId: string) {
  revalidatePath(`/manage/events/${eventId}/matches`);
  revalidatePath(`/manage/events/${eventId}`);
}

export async function generateMatchesAction(
  _prevState: FormState,
  formData: FormData,
): Promise<FormState> {
  const parsed = eventIdSchema.safeParse({ eventId: formData.get("eventId") });
  if (!parsed.success) return failure("活动标识格式不正确。");

  const auth = await requireManager();
  if (isFailure(auth)) return auth;

  let result: Awaited<ReturnType<typeof generateAndSaveMatches>>;
  try {
    result = await generateAndSaveMatches(parsed.data.eventId);
  } catch (error) {
    // 数据库读写失败会抛到这里，而不是静默变成"没有比赛"
    console.error("[admin] 生成比赛时出错:", error instanceof Error ? error.message : error);
    return failure("生成失败。请确认队伍与赛制设置都已完整。");
  }

  if (!result.ok) return failure(result.message);
  revalidateMatches(parsed.data.eventId);

  const preserved =
    result.preservedMatchCount > 0 ? `已保留 ${result.preservedMatchCount} 场已开始的比赛。` : "";
  return {
    status: "success",
    message:
      `已生成 ${result.matchCount} 场比赛。${preserved}` +
      (result.warningCount > 0 ? `有 ${result.warningCount} 条提示，请查看。` : ""),
  };
}

/** 发布某场比赛的分组（学生开始能看到名单）。 */
export async function publishMatchAction(
  _prevState: FormState,
  formData: FormData,
): Promise<FormState> {
  const parsed = matchIdSchema.safeParse({ matchId: formData.get("matchId") });
  if (!parsed.success) return failure("比赛标识格式不正确。");

  const auth = await requireManager();
  if (isFailure(auth)) return auth;

  const supabase = await createUserSupabaseClient();
  const { data: match } = await supabase
    .from("matches")
    .select("id, event_id, status")
    .eq("id", parsed.data.matchId)
    .maybeSingle();
  if (!match) return failure("找不到这场比赛。");

  const { error } = await supabase
    .from("matches")
    .update({ status: "published", published_at: new Date().toISOString() })
    .eq("id", parsed.data.matchId);

  if (error) {
    console.error("[admin] 发布比赛失败:", error.message);
    return failure("发布失败，请稍后再试。");
  }

  revalidateMatches(match.event_id as string);
  return { status: "success", message: "已发布。学生现在可以看到这场比赛的名单。" };
}

/**
 * 开始比赛：调用数据库函数 `start_match`。
 *
 * 规范 10.7 第 4 条要求"开始比赛时**永久锁定**名单快照"，
 * 而快照必须**原子地**写入 —— 因此这里只调用函数，不在应用层分步写。
 */
export async function startMatchAction(
  _prevState: FormState,
  formData: FormData,
): Promise<FormState> {
  const parsed = matchIdSchema.safeParse({ matchId: formData.get("matchId") });
  if (!parsed.success) return failure("比赛标识格式不正确。");

  const auth = await requireManager();
  if (isFailure(auth)) return auth;

  const supabase = await createUserSupabaseClient();
  const { data: before } = await supabase
    .from("matches")
    .select("event_id")
    .eq("id", parsed.data.matchId)
    .maybeSingle();

  const { error } = await supabase.rpc("start_match", { p_match_id: parsed.data.matchId });

  if (error) {
    console.error("[admin] 开始比赛失败:", error.message);
    if (error.message.includes("至少需要 2 支队伍")) {
      return failure("这场比赛还没有两支队伍，无法开始。");
    }
    if (error.message.includes("没有可锁定的名单")) {
      return failure("队伍里还没有成员，无法开始。请先完成配对。");
    }
    return failure("开始失败，请稍后再试。");
  }

  if (before?.event_id) revalidateMatches(before.event_id as string);
  return { status: "success", message: "比赛已开始，名单已锁定。" };
}
