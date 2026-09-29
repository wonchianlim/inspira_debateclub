// @vitest-environment node
import { describe, expect, it } from "vitest";

import {
  addMinutes,
  isValidTimeZone,
  utcToZonedLocal,
  zoneOffsetMinutes,
  zonedDateOf,
  zonedTimeToUtc,
} from "@/lib/domain/timezone";

/**
 * 时区换算。
 *
 * 这些结果全部是**已知事实**，不是"跑出来什么就写什么"：
 * 上海常年 UTC+8 且不使用夏令时；纽约使用夏令时（3 月第二个周日 02:00 开始，
 * 11 月第一个周日 02:00 结束）。
 *
 * 之所以要覆盖夏令时：如果实现只做"一次偏移修正"，在切换当天会算错一小时 ——
 * 而这类错误通常要到真实活动当天才会暴露。
 */

const SHANGHAI = "Asia/Shanghai";
const NEW_YORK = "America/New_York";
const UTC = "UTC";

describe("时区识别", () => {
  it("认识常见时区", () => {
    expect(isValidTimeZone(SHANGHAI)).toBe(true);
    expect(isValidTimeZone(NEW_YORK)).toBe(true);
    expect(isValidTimeZone(UTC)).toBe(true);
  });

  it("不认识的时区返回 false 而不是抛异常", () => {
    expect(isValidTimeZone("Mars/Olympus")).toBe(false);
    expect(isValidTimeZone("")).toBe(false);
    expect(isValidTimeZone("not a zone")).toBe(false);
  });
});

describe("偏移量", () => {
  it("上海常年 UTC+8", () => {
    expect(zoneOffsetMinutes(new Date("2026-01-15T00:00:00Z"), SHANGHAI)).toBe(480);
    expect(zoneOffsetMinutes(new Date("2026-07-15T00:00:00Z"), SHANGHAI)).toBe(480);
  });

  it("UTC 偏移为 0", () => {
    expect(zoneOffsetMinutes(new Date("2026-07-15T00:00:00Z"), UTC)).toBe(0);
  });

  it("纽约冬夏偏移不同（冬 -300，夏 -240）", () => {
    expect(zoneOffsetMinutes(new Date("2026-01-15T12:00:00Z"), NEW_YORK)).toBe(-300);
    expect(zoneOffsetMinutes(new Date("2026-07-15T12:00:00Z"), NEW_YORK)).toBe(-240);
  });
});

describe("本地时间 → UTC", () => {
  it("上海 18:00 等于 UTC 10:00", () => {
    expect(zonedTimeToUtc("2026-10-15T18:00", SHANGHAI).toISOString()).toBe(
      "2026-10-15T10:00:00.000Z",
    );
  });

  it("UTC 输入原样返回", () => {
    expect(zonedTimeToUtc("2026-10-15T18:00", UTC).toISOString()).toBe("2026-10-15T18:00:00.000Z");
  });

  it("纽约冬令时 09:00 等于 UTC 14:00", () => {
    expect(zonedTimeToUtc("2026-01-15T09:00", NEW_YORK).toISOString()).toBe(
      "2026-01-15T14:00:00.000Z",
    );
  });

  it("纽约夏令时 09:00 等于 UTC 13:00", () => {
    expect(zonedTimeToUtc("2026-07-15T09:00", NEW_YORK).toISOString()).toBe(
      "2026-07-15T13:00:00.000Z",
    );
  });

  it("夏令时开始当天（2026-03-08）之后的时间偏移已切换", () => {
    // 2026-03-08 是纽约夏令时开始日；当天 12:00 已是 EDT（UTC-4）
    expect(zonedTimeToUtc("2026-03-08T12:00", NEW_YORK).toISOString()).toBe(
      "2026-03-08T16:00:00.000Z",
    );
    // 前一天仍是 EST（UTC-5）
    expect(zonedTimeToUtc("2026-03-07T12:00", NEW_YORK).toISOString()).toBe(
      "2026-03-07T17:00:00.000Z",
    );
  });

  it("夏令时结束当天（2026-11-01）之后的时间偏移已切回", () => {
    expect(zonedTimeToUtc("2026-11-01T12:00", NEW_YORK).toISOString()).toBe(
      "2026-11-01T17:00:00.000Z",
    );
    expect(zonedTimeToUtc("2026-10-31T12:00", NEW_YORK).toISOString()).toBe(
      "2026-10-31T16:00:00.000Z",
    );
  });

  it("秒级输入被保留", () => {
    expect(zonedTimeToUtc("2026-10-15T18:00:30", SHANGHAI).toISOString()).toBe(
      "2026-10-15T10:00:30.000Z",
    );
  });

  it("格式不正确时给出明确错误，而不是悄悄算错", () => {
    for (const bad of ["", "2026-10-15", "2026/10/15 18:00", "18:00", "2026-10-15T18"]) {
      expect(() => zonedTimeToUtc(bad, SHANGHAI), `"${bad}" 应当被拒绝`).toThrow();
    }
  });
});

describe("UTC → 本地时间（回填表单）", () => {
  it("上海：UTC 10:00 显示为 18:00", () => {
    expect(utcToZonedLocal(new Date("2026-10-15T10:00:00Z"), SHANGHAI)).toBe("2026-10-15T18:00");
  });

  it("往返一致（多个时区、多个时刻）", () => {
    const samples = [
      "2026-01-15T09:00",
      "2026-07-15T09:00",
      "2026-03-08T12:00",
      "2026-11-01T12:00",
      "2026-12-31T23:59",
      "2026-01-01T00:00",
    ];
    for (const zone of [SHANGHAI, NEW_YORK, UTC]) {
      for (const local of samples) {
        const instant = zonedTimeToUtc(local, zone);
        expect(utcToZonedLocal(instant, zone), `${zone} 的 ${local} 往返后应一致`).toBe(local);
      }
    }
  });
});

describe("取本地日期（event_date 的正确算法）", () => {
  it("上海凌晨的活动，UTC 日期是前一天，但本地日期应是当天", () => {
    // 北京时间 10-15 00:30 = UTC 10-14 16:30
    const instant = zonedTimeToUtc("2026-10-15T00:30", SHANGHAI);
    expect(instant.toISOString()).toBe("2026-10-14T16:30:00.000Z");
    // 关键：活动日期必须是 10-15，而不是 UTC 的 10-14
    expect(zonedDateOf(instant, SHANGHAI)).toBe("2026-10-15");
  });

  it("上海深夜的活动，UTC 日期是同一天", () => {
    const instant = zonedTimeToUtc("2026-10-15T23:30", SHANGHAI);
    expect(zonedDateOf(instant, SHANGHAI)).toBe("2026-10-15");
  });

  it("同一个时刻在不同时区可能属于不同日期", () => {
    const instant = new Date("2026-10-14T16:30:00Z");
    expect(zonedDateOf(instant, SHANGHAI)).toBe("2026-10-15");
    expect(zonedDateOf(instant, UTC)).toBe("2026-10-14");
    expect(zonedDateOf(instant, NEW_YORK)).toBe("2026-10-14");
  });

  it("日期补零正确", () => {
    expect(zonedDateOf(new Date("2026-01-05T00:00:00Z"), UTC)).toBe("2026-01-05");
  });
});

describe("加分钟", () => {
  it("不修改入参", () => {
    const base = new Date("2026-10-15T10:00:00Z");
    const later = addMinutes(base, 30);
    expect(base.toISOString()).toBe("2026-10-15T10:00:00.000Z");
    expect(later.toISOString()).toBe("2026-10-15T10:30:00.000Z");
  });

  it("可以回退（负数）", () => {
    expect(addMinutes(new Date("2026-10-15T10:00:00Z"), -90).toISOString()).toBe(
      "2026-10-15T08:30:00.000Z",
    );
  });

  it("跨日正确", () => {
    expect(addMinutes(new Date("2026-10-15T23:30:00Z"), 45).toISOString()).toBe(
      "2026-10-16T00:15:00.000Z",
    );
  });
});
