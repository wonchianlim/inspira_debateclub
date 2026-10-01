// @vitest-environment node
import { describe, expect, it } from "vitest";

import {
  FALLBACK_GREETING,
  GREETING_LABELS,
  greetingKeyForHour,
  studentGreeting,
} from "@/lib/domain/greeting";
import { zonedHourOf } from "@/lib/domain/timezone";

/**
 * 按时段问候（规范 §8.1）。
 *
 * 规范原文："Do not hard-code time greeting; derive it locally and fall back to
 * `Welcome back`."
 *
 * 这些测试防的是**一个永远不会报错的退化**：页面上写死"晚上好"，
 * 谁也不会因此收到错误，但所有人任何时间看到的都是同一句话。
 */

describe("时段划分", () => {
  it("5–11 点早上、12–17 点下午、其余晚上", () => {
    expect(greetingKeyForHour(5)).toBe("morning");
    expect(greetingKeyForHour(11)).toBe("morning");
    expect(greetingKeyForHour(12)).toBe("afternoon");
    expect(greetingKeyForHour(17)).toBe("afternoon");
    expect(greetingKeyForHour(18)).toBe("evening");
    expect(greetingKeyForHour(23)).toBe("evening");
    // 凌晨仍然算"晚上好" —— 中文里 1 点说"晚上好"是自然的，
    // 单独分出"凌晨好"反而奇怪
    expect(greetingKeyForHour(0)).toBe("evening");
    expect(greetingKeyForHour(4)).toBe("evening");
  });

  it("一天 24 小时都有归属，没有落空的时段", () => {
    for (let hour = 0; hour < 24; hour += 1) {
      expect(Object.keys(GREETING_LABELS)).toContain(greetingKeyForHour(hour));
    }
  });
});

describe("问候语", () => {
  const now = new Date("2026-10-15T11:00:00Z"); // 上海 19:00 → 晚上

  it("按时段加姓名", () => {
    expect(studentGreeting(now, "陈同学", "Asia/Shanghai")).toBe("晚上好，陈同学");
  });

  it("取不到姓名时回退到「欢迎回来」（规范明确要求有回退）", () => {
    expect(studentGreeting(now, null, "Asia/Shanghai")).toBe(FALLBACK_GREETING);
    expect(studentGreeting(now, "   ", "Asia/Shanghai")).toBe(FALLBACK_GREETING);
  });

  /**
   * ⚠️ 这条是**反向验证**：如果实现用了 `Date.getHours()`（服务器或测试机时区），
   * 同一个时刻在纽约会算成"早上"、在上海算成"晚上"，问候语就会错。
   * 用两个相差很大的时区断言同一时刻得到不同问候 —— 写死或看错时区都会失败。
   */
  it("按**活动/俱乐部**时区判断，不是按服务器时区", () => {
    // UTC 13:00 → 上海 21:00（晚上）；纽约 09:00（早上）
    const instant = new Date("2026-10-15T13:00:00Z");
    expect(studentGreeting(instant, "Alex", "Asia/Shanghai")).toBe("晚上好，Alex");
    expect(studentGreeting(instant, "Alex", "America/New_York")).toBe("早上好，Alex");
  });

  it("跨时区取小时：UTC 23:30 在上海已经是第二天早上", () => {
    expect(zonedHourOf(new Date("2026-10-15T23:30:00Z"), "Asia/Shanghai")).toBe(7);
    expect(zonedHourOf(new Date("2026-10-15T23:30:00Z"), "UTC")).toBe(23);
  });
});
