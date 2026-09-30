"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { requireSession } from "@/lib/auth/session";
import type { FormState } from "@/lib/forms/form-state";
import { createUserSupabaseClient } from "@/lib/supabase/server";

/**
 * 通知中心的已读标记（Phase 9）。
 *
 * ⚠️ 三个刻意的地方：
 *
 * 1. **只要登录就能标记**，不限定角色 —— 通知是发给所有人的。
 * 2. **幂等**：重复标记不报错。唯一约束会拒绝第二行，
 *    而"标记已读"重复点击是**正常操作**，把它显示成错误是错的。
 * 3. **不做"全部标记已读"**。规范没有要求，而且它会掩盖
 *    "哪一条是刚刚看到的" —— 那正是通知中心里唯一有用的信息。
 */

const markReadSchema = z.object({
  noticeId: z.guid({ error: "通知标识格式不正确" }),
});

export async function markNoticeReadAction(
  _prevState: FormState,
  formData: FormData,
): Promise<FormState> {
  const parsed = markReadSchema.safeParse({ noticeId: formData.get("noticeId") });
  if (!parsed.success) return { status: "error", message: "提交的内容格式不正确。" };

  const session = await requireSession();
  const supabase = await createUserSupabaseClient();

  const { error } = await supabase.from("notice_reads").insert({
    notice_id: parsed.data.noticeId,
    profile_id: session.profileId,
  });

  if (error) {
    /*
     * ⚠️ 重复标记**不是错误**。唯一约束拒绝时说明"已经读过了"，
     *    那正是用户想要的状态。把它显示成失败会让人以为没生效而反复点。
     */
    if (error.code === "23505") {
      revalidatePath("/notifications");
      return { status: "success", message: "这条已经标记过了。" };
    }
    console.error("[notifications] 标记已读失败:", error.message);
    return { status: "error", message: "标记失败，请稍后再试。" };
  }

  revalidatePath("/notifications");
  return { status: "success", message: "已标记为已读。" };
}
