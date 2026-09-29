/**
 * 克隆活动的时间平移（纯领域逻辑）。
 *
 * 语义：以原活动为模板，新活动的**所有时间点按同一个差值整体平移**，
 * 保持相对安排不变（报名提前几天、签到提前多少分钟都自动跟着走）。
 *
 * 为什么单独抽出来：这段计算原本写在 Server Action 里，而 Server Action 依赖
 * 数据库与 Next 运行时，**无法用单元测试覆盖**。平移算错（例如漏掉一个时间点、
 * 或者 event_date 没有跟着变）会产生"新活动日期对不上"这种很难排查的问题。
 * 抽成纯函数后可以穷举验证。
 */

import { addMinutes, zonedDateOf, zonedTimeToUtc } from "@/lib/domain/timezone";

export type CloneSourceSchedule = {
  timezone: string;
  startsAt: string;
  endsAt: string;
  registrationOpensAt: string;
  registrationClosesAt: string;
  checkInOpensAt: string;
  warningAt: string;
};

export type ClonedSchedule = {
  timezone: string;
  event_date: string;
  starts_at: string;
  ends_at: string;
  registration_opens_at: string;
  registration_closes_at: string;
  check_in_opens_at: string;
  warning_at: string;
  /** 平移了多少分钟（正数表示往后挪）。便于在日志与测试里核对。 */
  shiftMinutes: number;
};

/**
 * 计算克隆后的时间点。
 *
 * @param source 原活动的时间安排（全部是 UTC ISO 字符串）
 * @param newStartsAtLocal 新活动的开始时间，按**原活动的时区**理解
 */
export function computeClonedSchedule(
  source: CloneSourceSchedule,
  newStartsAtLocal: string,
): ClonedSchedule {
  const newStartsAt = zonedTimeToUtc(newStartsAtLocal, source.timezone);
  const originalStartsAt = new Date(source.startsAt);

  // 取整到分钟：界面只精确到分钟，避免把秒级误差带进新活动
  const shiftMinutes = Math.round((newStartsAt.getTime() - originalStartsAt.getTime()) / 60_000);
  const shift = (iso: string) => addMinutes(new Date(iso), shiftMinutes).toISOString();

  return {
    timezone: source.timezone,
    // ⚠️ event_date 必须按**新的**开始时间重新推导。
    //    规范要求它等于 starts_at 在活动时区下的日期；直接照抄原日期会在跨日时出错。
    event_date: zonedDateOf(newStartsAt, source.timezone),
    starts_at: newStartsAt.toISOString(),
    ends_at: shift(source.endsAt),
    registration_opens_at: shift(source.registrationOpensAt),
    registration_closes_at: shift(source.registrationClosesAt),
    check_in_opens_at: shift(source.checkInOpensAt),
    warning_at: shift(source.warningAt),
    shiftMinutes,
  };
}
