"use server";

import { revalidatePath } from "next/cache";

import { SETTINGS_KEYS } from "@/lib/admin/settings";
import { getSessionContext } from "@/lib/auth/session";
import type { FormState } from "@/lib/forms/form-state";
import { createUserSupabaseClient } from "@/lib/supabase/server";
import { scheduleSettingsSchema } from "@/lib/validation/settings";

/**
 * 系统设置的写入。
 *
 * 只有超级管理员可以写：数据库策略 `system_settings` 要求 `is_super_admin()`，
 * 触发器另有保护；Phase 1 的 F-MGR-04b 用例证明管理员写系统设置会被拒绝。
 * 本文件再做一次显式检查，给出中文提示。
 */

const NOT_AUTHORIZED = "只有超级管理员可以修改系统设置。";

export async function updateScheduleSettingsAction(
  _prevState: FormState,
  formData: FormData,
): Promise<FormState> {
  const parsed = scheduleSettingsSchema.safeParse({
    registrationOpensDaysBefore: formData.get("registrationOpensDaysBefore"),
    registrationClosesDaysBefore: formData.get("registrationClosesDaysBefore"),
    checkInOpensMinutesBefore: formData.get("checkInOpensMinutesBefore"),
    warningMinutesBefore: formData.get("warningMinutesBefore"),
  });

  if (!parsed.success) {
    const fieldErrors: Record<string, string[]> = {};
    for (const issue of parsed.error.issues) {
      const key = issue.path.map(String).join(".") || "_form";
      fieldErrors[key] = [...(fieldErrors[key] ?? []), issue.message];
    }
    return { status: "error", message: "请检查表单内容。", fieldErrors };
  }

  const session = await getSessionContext();
  if (!session) return { status: "error", message: "登录状态已失效，请重新登录。" };
  if (!session.roles.includes("super_admin")) {
    return { status: "error", message: NOT_AUTHORIZED };
  }

  const value = parsed.data;

  // 值与说明一起写：说明会显示在设置页上，便于以后的人知道这一项是做什么的
  const rows = [
    {
      key: SETTINGS_KEYS.registrationOpensDaysBefore,
      value: value.registrationOpensDaysBefore,
      description: "活动开始前多少天开放报名。用于新建活动时的默认值。",
    },
    {
      key: SETTINGS_KEYS.registrationClosesDaysBefore,
      value: value.registrationClosesDaysBefore,
      description: "活动开始前多少天截止报名。必须小于「开放天数」。",
    },
    {
      key: SETTINGS_KEYS.checkInOpensMinutesBefore,
      value: value.checkInOpensMinutesBefore,
      description: "活动开始前多少分钟开放签到。规范第 9.4 节的默认值是 30。",
    },
    {
      key: SETTINGS_KEYS.warningMinutesBefore,
      value: value.warningMinutesBefore,
      description: "活动开始前多少分钟触发警示（现场看板标出还没到齐的房间）。",
    },
  ].map((row) => ({ ...row, updated_by: session.profileId }));

  const supabase = await createUserSupabaseClient();
  const { error } = await supabase.from("system_settings").upsert(rows, { onConflict: "key" });

  if (error) {
    console.error("[admin] 保存系统设置失败:", error.message);
    return { status: "error", message: "保存失败，请稍后再试。" };
  }

  revalidatePath("/admin/settings");
  revalidatePath("/manage/events/new");
  return { status: "success", message: "已保存。新建活动时会使用这些默认值。" };
}
