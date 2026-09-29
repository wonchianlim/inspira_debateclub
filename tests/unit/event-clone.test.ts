// @vitest-environment node
import { describe, expect, it } from "vitest";

import { computeClonedSchedule, type CloneSourceSchedule } from "@/lib/domain/event-clone";
import { zonedTimeToUtc } from "@/lib/domain/timezone";

/**
 * 克隆活动的时间平移。
 *
 * 重点：平移必须**整体一致**（六个时间点差值相同），并且 `event_date` 要按
 * 新的开始时间**重新推导** —— 直接照抄原日期会在跨日时出错。
 */

/** 上海时区的一场活动：2026-10-15 18:00 开始，报名提前 7 天开放、提前 1 天截止。 */
const SOURCE: CloneSourceSchedule = {
  timezone: "Asia/Shanghai",
  startsAt: zonedTimeToUtc("2026-10-15T18:00", "Asia/Shanghai").toISOString(),
  endsAt: zonedTimeToUtc("2026-10-15T21:00", "Asia/Shanghai").toISOString(),
  registrationOpensAt: zonedTimeToUtc("2026-10-08T09:00", "Asia/Shanghai").toISOString(),
  registrationClosesAt: zonedTimeToUtc("2026-10-14T23:00", "Asia/Shanghai").toISOString(),
  checkInOpensAt: zonedTimeToUtc("2026-10-15T17:30", "Asia/Shanghai").toISOString(),
  warningAt: zonedTimeToUtc("2026-10-15T17:50", "Asia/Shanghai").toISOString(),
};

const MINUTES_PER_DAY = 24 * 60;

describe("整体平移", () => {
  it("往后挪 7 天时，六个时间点的平移量完全相同", () => {
    const cloned = computeClonedSchedule(SOURCE, "2026-10-22T18:00");
    expect(cloned.shiftMinutes).toBe(7 * MINUTES_PER_DAY);

    // 每个时间点与源相比都恰好差 7 天
    for (const key of [
      "starts_at",
      "ends_at",
      "registration_opens_at",
      "registration_closes_at",
      "check_in_opens_at",
      "warning_at",
    ] as const) {
      const sourceKey = key.replace(/_([a-z])/g, (_, c: string) =>
        c.toUpperCase(),
      ) as keyof CloneSourceSchedule;
      const deltaMinutes =
        (new Date(cloned[key]).getTime() - new Date(SOURCE[sourceKey] as string).getTime()) /
        60_000;
      expect(deltaMinutes, `${key} 的平移量应当一致`).toBe(7 * MINUTES_PER_DAY);
    }
  });

  it("相对安排保持不变：报名仍提前 7 天开放、签到仍提前 30 分钟", () => {
    const cloned = computeClonedSchedule(SOURCE, "2026-11-05T18:00");
    const starts = new Date(cloned.starts_at).getTime();
    const minutesBefore = (iso: string) => (starts - new Date(iso).getTime()) / 60_000;

    // 源活动：报名 10-08 09:00 开放、10-14 23:00 截止，活动 10-15 18:00 开始
    //   开放 → 活动：7 天 9 小时
    //   截止 → 活动：19 小时
    expect(minutesBefore(cloned.registration_opens_at)).toBe(7 * MINUTES_PER_DAY + 9 * 60);
    expect(minutesBefore(cloned.registration_closes_at)).toBe(19 * 60);
    expect(minutesBefore(cloned.check_in_opens_at)).toBe(30);
    expect(minutesBefore(cloned.warning_at)).toBe(10);
    expect(minutesBefore(cloned.ends_at)).toBe(-180);
  });

  it("可以往前挪（负数平移）", () => {
    const cloned = computeClonedSchedule(SOURCE, "2026-10-14T18:00");
    expect(cloned.shiftMinutes).toBe(-MINUTES_PER_DAY);
    expect(new Date(cloned.starts_at).getTime()).toBeLessThan(new Date(SOURCE.startsAt).getTime());
  });

  it("新活动时间与源完全相同也允许（平移量为 0）", () => {
    const cloned = computeClonedSchedule(SOURCE, "2026-10-15T18:00");
    expect(cloned.shiftMinutes).toBe(0);
    expect(cloned.starts_at).toBe(SOURCE.startsAt);
  });
});

describe("event_date 必须按新的开始时间重新推导", () => {
  it("跨日平移后活动日期跟着变", () => {
    const cloned = computeClonedSchedule(SOURCE, "2026-10-22T18:00");
    expect(cloned.event_date).toBe("2026-10-22");
  });

  it("新活动排在凌晨时，UTC 日期是前一天但 event_date 是当天", () => {
    // 上海 2026-10-22 00:30 = UTC 2026-10-21 16:30
    const cloned = computeClonedSchedule(SOURCE, "2026-10-22T00:30");
    expect(cloned.starts_at).toBe("2026-10-21T16:30:00.000Z");
    expect(cloned.event_date).toBe("2026-10-22");
  });

  it("月份/年份交界也正确", () => {
    expect(computeClonedSchedule(SOURCE, "2026-12-31T23:30").event_date).toBe("2026-12-31");
    expect(computeClonedSchedule(SOURCE, "2027-01-01T00:30").event_date).toBe("2027-01-01");
  });

  it("时区沿用小原活动", () => {
    const cloned = computeClonedSchedule(SOURCE, "2026-10-22T18:00");
    expect(cloned.timezone).toBe("Asia/Shanghai");
  });
});

describe("时区不同也能算对", () => {
  it("纽约活动（含夏令时）按纽约时区理解新时间", () => {
    const newYorkSource: CloneSourceSchedule = {
      timezone: "America/New_York",
      startsAt: zonedTimeToUtc("2026-03-07T12:00", "America/New_York").toISOString(),
      endsAt: zonedTimeToUtc("2026-03-07T15:00", "America/New_York").toISOString(),
      registrationOpensAt: zonedTimeToUtc("2026-03-01T12:00", "America/New_York").toISOString(),
      registrationClosesAt: zonedTimeToUtc("2026-03-06T12:00", "America/New_York").toISOString(),
      checkInOpensAt: zonedTimeToUtc("2026-03-07T11:30", "America/New_York").toISOString(),
      warningAt: zonedTimeToUtc("2026-03-07T11:50", "America/New_York").toISOString(),
    };

    // 挪到夏令时开始之后的一天
    const cloned = computeClonedSchedule(newYorkSource, "2026-03-08T12:00");
    expect(cloned.event_date).toBe("2026-03-08");

    // 由于 3/8 当天发生了夏令时切换，实际时刻差不是整 24 小时，
    // 而是 23 小时。这正是"必须按本地时间而不是加 86400 秒"的原因。
    expect(cloned.shiftMinutes).toBe(23 * 60);
    expect(cloned.starts_at).toBe(
      zonedTimeToUtc("2026-03-08T12:00", "America/New_York").toISOString(),
    );
  });
});
