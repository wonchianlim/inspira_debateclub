// @vitest-environment node
import { describe, expect, it } from "vitest";

import {
  DEFAULT_SCHEDULE_OFFSETS,
  computeDefaultSchedule,
  isValidOffsets,
  offsetsToMinutes,
} from "@/lib/domain/event-schedule";
import { eventInputSchema, toEventScheduleRecord } from "@/lib/validation/events";

/**
 * 活动时间输入的校验与换算。
 *
 * 重点验证两件事：
 *   1. **非法的时间组合被拒绝**，而且拒绝理由与数据库 CHECK 约束一一对应；
 *   2. **event_date 由 starts_at 推导**，不会出现"北京凌晨的活动日期差一天"。
 */

/** 一份合法的基础输入；各用例在它之上只改一处。 */
const VALID_INPUT = {
  title: "虚构秋季赛",
  timezone: "Asia/Shanghai",
  startsAtLocal: "2026-10-15T18:00",
  endsAtLocal: "2026-10-15T21:00",
  registrationOpensAtLocal: "2026-10-08T09:00",
  registrationClosesAtLocal: "2026-10-14T23:00",
  checkInOpensAtLocal: "2026-10-15T17:30",
  warningAtLocal: "2026-10-15T17:50",
  meetingUrl: "https://example.invalid/room",
  venue: "",
  notice: "请提前十分钟到场",
};

describe("合法输入", () => {
  it("基础输入通过校验", () => {
    const result = eventInputSchema.safeParse(VALID_INPUT);
    if (!result.success) {
      throw new Error("本应通过，实际报错：" + JSON.stringify(result.error.issues, null, 2));
    }
    expect(result.success).toBe(true);
  });

  it("可选字段留空也通过", () => {
    const result = eventInputSchema.safeParse({
      ...VALID_INPUT,
      meetingUrl: "",
      notice: "",
    });
    expect(result.success).toBe(true);
  });

  it("拒绝空标题与超长标题", () => {
    expect(eventInputSchema.safeParse({ ...VALID_INPUT, title: "" }).success).toBe(false);
    expect(eventInputSchema.safeParse({ ...VALID_INPUT, title: "  " }).success).toBe(false);
    expect(eventInputSchema.safeParse({ ...VALID_INPUT, title: "字".repeat(121) }).success).toBe(
      false,
    );
  });

  it("拒绝无法识别的时区", () => {
    expect(eventInputSchema.safeParse({ ...VALID_INPUT, timezone: "Mars/Olympus" }).success).toBe(
      false,
    );
  });

  it("拒绝不完整的日期时间", () => {
    for (const bad of ["", "2026-10-15", "2026/10/15 18:00", "18:00"]) {
      expect(eventInputSchema.safeParse({ ...VALID_INPUT, startsAtLocal: bad }).success).toBe(
        false,
      );
    }
  });

  it("拒绝不安全的会议链接（只允许 http/https）", () => {
    for (const bad of ["javascript:alert(1)", "ftp://x", "//example.com", "not a url"]) {
      expect(eventInputSchema.safeParse({ ...VALID_INPUT, meetingUrl: bad }).success, bad).toBe(
        false,
      );
    }
  });
});

/**
 * 每一条都对应数据库里的一条 CHECK 约束。
 * 数据库才是真正的保证；这里确保界面能提前给出**人话**提示，
 * 而不是让用户撞上一条英文的数据库错误。
 */
describe("非法时间组合（逐条对应数据库 CHECK 约束）", () => {
  const cases: Array<{ name: string; patch: Record<string, string>; field: string }> = [
    {
      name: "报名截止早于报名开放（events_registration_window_valid）",
      patch: { registrationClosesAtLocal: "2026-10-07T09:00" },
      field: "registrationClosesAtLocal",
    },
    {
      name: "报名截止晚于活动开始（events_registration_closes_before_start）",
      patch: { registrationClosesAtLocal: "2026-10-15T19:00" },
      field: "registrationClosesAtLocal",
    },
    {
      name: "签到开放晚于活动开始（events_check_in_opens_before_start）",
      patch: { checkInOpensAtLocal: "2026-10-15T18:30" },
      field: "checkInOpensAtLocal",
    },
    {
      name: "警示时间晚于活动开始（events_warning_before_start）",
      patch: { warningAtLocal: "2026-10-15T18:30" },
      field: "warningAtLocal",
    },
    {
      name: "结束早于开始（events_start_before_end）",
      patch: { endsAtLocal: "2026-10-15T17:00" },
      field: "endsAtLocal",
    },
  ];

  for (const testCase of cases) {
    it(testCase.name, () => {
      const result = eventInputSchema.safeParse({ ...VALID_INPUT, ...testCase.patch });
      expect(result.success).toBe(false);
      if (!result.success) {
        const paths = result.error.issues.map((issue) => issue.path.join("."));
        expect(paths).toContain(testCase.field);
      }
    });
  }

  it("开始时间与结束时间相同也应被拒绝", () => {
    const result = eventInputSchema.safeParse({ ...VALID_INPUT, endsAtLocal: "2026-10-15T18:00" });
    expect(result.success).toBe(false);
  });
});

describe("换算成数据库字段", () => {
  it("上海 18:00 存为 UTC 10:00，日期不变", () => {
    const parsed = eventInputSchema.parse(VALID_INPUT);
    const record = toEventScheduleRecord(parsed);
    expect(record.starts_at).toBe("2026-10-15T10:00:00.000Z");
    expect(record.event_date).toBe("2026-10-15");
    expect(record.timezone).toBe("Asia/Shanghai");
  });

  it("北京凌晨的活动：UTC 日期是前一天，但 event_date 必须是当天", () => {
    const parsed = eventInputSchema.parse({
      ...VALID_INPUT,
      startsAtLocal: "2026-10-15T00:30",
      endsAtLocal: "2026-10-15T03:00",
      registrationClosesAtLocal: "2026-10-14T23:00",
      checkInOpensAtLocal: "2026-10-15T00:00",
      warningAtLocal: "2026-10-15T00:20",
    });
    const record = toEventScheduleRecord(parsed);
    // UTC 落在了前一天
    expect(record.starts_at).toBe("2026-10-14T16:30:00.000Z");
    // 但活动日期按活动时区，必须是 10-15
    expect(record.event_date).toBe("2026-10-15");
  });

  it("六个时间点全部按同一时区换算", () => {
    const parsed = eventInputSchema.parse(VALID_INPUT);
    const record = toEventScheduleRecord(parsed);
    expect(record.registration_opens_at).toBe("2026-10-08T01:00:00.000Z");
    expect(record.registration_closes_at).toBe("2026-10-14T15:00:00.000Z");
    expect(record.check_in_opens_at).toBe("2026-10-15T09:30:00.000Z");
    expect(record.warning_at).toBe("2026-10-15T09:50:00.000Z");
    expect(record.ends_at).toBe("2026-10-15T13:00:00.000Z");
  });
});

describe("默认时间偏移量", () => {
  it("签到提前 30 分钟来自规范第 9.4 节", () => {
    expect(DEFAULT_SCHEDULE_OFFSETS.checkInOpensMinutesBefore).toBe(30);
  });

  it("由开始时间推算其余时间点", () => {
    const starts = new Date("2026-10-15T10:00:00Z"); // 上海 18:00
    const schedule = computeDefaultSchedule(starts, DEFAULT_SCHEDULE_OFFSETS);
    // 提前 7 天
    expect(schedule.registrationOpensAt.toISOString()).toBe("2026-10-08T10:00:00.000Z");
    // 提前 1 天
    expect(schedule.registrationClosesAt.toISOString()).toBe("2026-10-14T10:00:00.000Z");
    // 提前 30 分钟 / 10 分钟
    expect(schedule.checkInOpensAt.toISOString()).toBe("2026-10-15T09:30:00.000Z");
    expect(schedule.warningAt.toISOString()).toBe("2026-10-15T09:50:00.000Z");
  });

  it("推算出的时间点满足数据库约束（开放早于截止、截止不晚于开始）", () => {
    const starts = new Date("2026-10-15T10:00:00Z");
    const schedule = computeDefaultSchedule(starts, DEFAULT_SCHEDULE_OFFSETS);
    expect(schedule.registrationOpensAt.getTime()).toBeLessThan(
      schedule.registrationClosesAt.getTime(),
    );
    expect(schedule.registrationClosesAt.getTime()).toBeLessThanOrEqual(starts.getTime());
    expect(schedule.checkInOpensAt.getTime()).toBeLessThanOrEqual(starts.getTime());
    expect(schedule.warningAt.getTime()).toBeLessThanOrEqual(starts.getTime());
  });

  it("将天数换算成分钟", () => {
    const minutes = offsetsToMinutes(DEFAULT_SCHEDULE_OFFSETS);
    expect(minutes.registrationOpensMinutesBefore).toBe(7 * 24 * 60);
    expect(minutes.registrationClosesMinutesBefore).toBe(1 * 24 * 60);
  });

  it("非法偏移量被识别（例如报名开放不早于截止，会推出违反约束的时间）", () => {
    expect(isValidOffsets(DEFAULT_SCHEDULE_OFFSETS)).toBe(true);
    expect(isValidOffsets({ ...DEFAULT_SCHEDULE_OFFSETS, registrationOpensDaysBefore: 1 })).toBe(
      false,
    );
    expect(isValidOffsets({ ...DEFAULT_SCHEDULE_OFFSETS, registrationClosesDaysBefore: 7 })).toBe(
      false,
    );
    expect(isValidOffsets({ ...DEFAULT_SCHEDULE_OFFSETS, checkInOpensMinutesBefore: -5 })).toBe(
      false,
    );
    expect(isValidOffsets({ ...DEFAULT_SCHEDULE_OFFSETS, warningMinutesBefore: 1.5 })).toBe(false);
  });
});

/**
 * 场地字段（2026-10-01 产品负责人决定新增）。
 *
 * 这个字段是**可选**的：线上活动没有场地，线下活动没有链接，草稿阶段两者都可能还没定。
 * 因此这里验证的是"允许留空"与"上限与数据库约束一致"。
 */
describe("线下场地", () => {
  it("留空是允许的（线上活动没有场地）", () => {
    expect(eventInputSchema.safeParse({ ...VALID_INPUT, venue: "" }).success).toBe(true);
    // 字段整个不传也要能过 —— 老表单/老数据不会带上它
    const withoutVenue: Record<string, unknown> = { ...VALID_INPUT };
    delete withoutVenue.venue;
    expect(eventInputSchema.safeParse(withoutVenue).success).toBe(true);
  });

  it("填了场地就带上它", () => {
    const result = eventInputSchema.safeParse({ ...VALID_INPUT, venue: "教学楼 A101" });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.venue).toBe("教学楼 A101");
  });

  it("前后空格会被去掉", () => {
    const result = eventInputSchema.safeParse({ ...VALID_INPUT, venue: "  A101  " });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.venue).toBe("A101");
  });

  /**
   * ⚠️ 上限必须与数据库的 `events_venue_length` 一致（200 字）。
   * 两边不同的话，表单会放行一个数据库必然拒绝的值 ——
   * 用户看到的会是一句英文的约束错误，而不是"场地最多 200 字"。
   */
  it("超过 200 字被拒绝（与数据库约束同一条线）", () => {
    const long = "场".repeat(201);
    expect(eventInputSchema.safeParse({ ...VALID_INPUT, venue: long }).success).toBe(false);
    expect(eventInputSchema.safeParse({ ...VALID_INPUT, venue: "场".repeat(200) }).success).toBe(
      true,
    );
  });
});
