import "server-only";

import {
  DEFAULT_SCHEDULE_OFFSETS,
  type ScheduleOffsets,
  isValidOffsets,
} from "@/lib/domain/event-schedule";
import { createUserSupabaseClient } from "@/lib/supabase/server";

/**
 * 系统设置（`system_settings`）的读写。
 *
 * 用途：把"可以调整的业务默认值"放在数据库里，而不是写死在代码中。
 * 这样产品负责人改时间安排时**不需要改代码、不需要重新部署**。
 *
 * 谁能写：只有超级管理员（数据库策略 + 触发器已强制，Phase 1 有测试守住）。
 */

export const SETTINGS_KEYS = {
  registrationOpensDaysBefore: "schedule.registration_opens_days_before",
  registrationClosesDaysBefore: "schedule.registration_closes_days_before",
  checkInOpensMinutesBefore: "schedule.check_in_opens_minutes_before",
  warningMinutesBefore: "schedule.warning_minutes_before",
} as const;

type SettingKey = (typeof SETTINGS_KEYS)[keyof typeof SETTINGS_KEYS];

export type SettingEntry = {
  key: string;
  value: unknown;
  description: string | null;
  updatedAt: string;
};

export async function listSettings(): Promise<SettingEntry[]> {
  const supabase = await createUserSupabaseClient();
  const { data, error } = await supabase
    .from("system_settings")
    .select("key, value, description, updated_at")
    .order("key", { ascending: true });

  if (error) {
    console.error("[admin] 读取系统设置失败:", error.message);
    return [];
  }

  return (data ?? []).map((row) => ({
    key: row.key,
    value: row.value,
    description: row.description,
    updatedAt: row.updated_at,
  }));
}

async function readNumberSetting(key: SettingKey): Promise<number | null> {
  const supabase = await createUserSupabaseClient();
  const { data, error } = await supabase
    .from("system_settings")
    .select("value")
    .eq("key", key)
    .maybeSingle();

  if (error || !data) return null;

  const raw = data.value;
  // 值存的是 jsonb，可能是数字，也可能是 {"value": n} 这种包装。
  // 两种都接受，避免因为存法不同而静默退回默认值。
  if (typeof raw === "number" && Number.isFinite(raw)) return raw;
  if (raw && typeof raw === "object" && "value" in raw) {
    const inner = (raw as { value: unknown }).value;
    if (typeof inner === "number" && Number.isFinite(inner)) return inner;
  }
  return null;
}

/**
 * 读取活动时间安排的默认偏移量。
 *
 * 缺失或不合法的设置会**退回默认值**，并在服务端记录一条警告 ——
 * 不让一个写错的设置把"新建活动"整个功能弄坏。
 */
export async function getScheduleOffsets(): Promise<ScheduleOffsets> {
  const [opens, closes, checkIn, warning] = await Promise.all([
    readNumberSetting(SETTINGS_KEYS.registrationOpensDaysBefore),
    readNumberSetting(SETTINGS_KEYS.registrationClosesDaysBefore),
    readNumberSetting(SETTINGS_KEYS.checkInOpensMinutesBefore),
    readNumberSetting(SETTINGS_KEYS.warningMinutesBefore),
  ]);

  const offsets: ScheduleOffsets = {
    registrationOpensDaysBefore: opens ?? DEFAULT_SCHEDULE_OFFSETS.registrationOpensDaysBefore,
    registrationClosesDaysBefore: closes ?? DEFAULT_SCHEDULE_OFFSETS.registrationClosesDaysBefore,
    checkInOpensMinutesBefore: checkIn ?? DEFAULT_SCHEDULE_OFFSETS.checkInOpensMinutesBefore,
    warningMinutesBefore: warning ?? DEFAULT_SCHEDULE_OFFSETS.warningMinutesBefore,
  };

  if (!isValidOffsets(offsets)) {
    console.warn("[admin] 系统设置里的时间偏移量不合法，已退回默认值:", offsets);
    return DEFAULT_SCHEDULE_OFFSETS;
  }

  return offsets;
}
