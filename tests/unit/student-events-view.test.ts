// @vitest-environment node
import { describe, expect, it } from "vitest";

import {
  DEFAULT_EVENTS_VIEW,
  buildEventsHref,
  hasActiveFilters,
  parseEventsView,
  selectStudentEvents,
  type StudentEventsListItem,
} from "@/lib/domain/student-events-view";

/**
 * 学生活动列表的分段与筛选（规范 §8.2）。
 *
 * ⚠️ 这里最要紧的一组用例是**乱填的网址参数**。
 * 地址栏是用户可以随手改的地方：`?location=<script>`、`?tab=123`、
 * `?format=一个已经删掉的赛制` 都必须在页面上表现为"退回默认"，
 * 而不是报错、也不是永远显示空列表。
 */

const NOW = new Date("2026-10-15T04:00:00Z");

function event(
  overrides: Partial<StudentEventsListItem> & { id?: string } = {},
): StudentEventsListItem & {
  id: string;
} {
  return {
    id: overrides.id ?? "e1",
    status: "registration_open",
    startsAt: "2026-10-20T10:00:00Z",
    venue: "教学楼 A101",
    meetingUrl: null,
    enabledFormatCodes: ["PF"],
    myRegistrationStatus: null,
    ...overrides,
  };
}

describe("分段：即将到来 / 已结束", () => {
  it("按开始时间分成两段", () => {
    const events = [
      event({ id: "future", startsAt: "2026-10-20T10:00:00Z" }),
      event({ id: "past", startsAt: "2026-10-01T10:00:00Z" }),
    ];
    const { upcoming, past } = selectStudentEvents(events, NOW, DEFAULT_EVENTS_VIEW);
    expect(upcoming.map((e) => e.id)).toEqual(["future"]);
    expect(past.map((e) => e.id)).toEqual(["past"]);
  });

  it("即将到来按**从近到远**，已结束按**从新到旧**", () => {
    const events = [
      event({ id: "f2", startsAt: "2026-10-25T10:00:00Z" }),
      event({ id: "f1", startsAt: "2026-10-18T10:00:00Z" }),
      event({ id: "p1", startsAt: "2026-09-01T10:00:00Z" }),
      event({ id: "p2", startsAt: "2026-10-10T10:00:00Z" }),
    ];
    const { upcoming, past } = selectStudentEvents(events, NOW, DEFAULT_EVENTS_VIEW);
    expect(upcoming.map((e) => e.id)).toEqual(["f1", "f2"]);
    expect(past.map((e) => e.id)).toEqual(["p2", "p1"]);
  });

  it("草稿 / 已取消 / 已归档两段都不出现", () => {
    const events = [
      event({ id: "draft", status: "draft" }),
      event({ id: "cancelled", status: "cancelled" }),
      event({ id: "archived", status: "archived", startsAt: "2026-09-01T10:00:00Z" }),
      event({ id: "completed", status: "completed", startsAt: "2026-09-02T10:00:00Z" }),
    ];
    const { upcoming, past } = selectStudentEvents(events, NOW, DEFAULT_EVENTS_VIEW);
    expect(upcoming).toHaveLength(0);
    expect(past.map((e) => e.id)).toEqual(["completed"]);
  });

  it("刚好在这一刻开始的算「即将到来」", () => {
    const { upcoming, past } = selectStudentEvents(
      [event({ startsAt: NOW.toISOString() })],
      NOW,
      DEFAULT_EVENTS_VIEW,
    );
    expect(upcoming).toHaveLength(1);
    expect(past).toHaveLength(0);
  });
});

describe("筛选", () => {
  it("按赛制：活动启用了这个赛制才留下", () => {
    const events = [
      event({ id: "pf", enabledFormatCodes: ["PF"] }),
      event({ id: "bp", enabledFormatCodes: ["BP", "PF"] }),
      event({ id: "wsdc", enabledFormatCodes: ["WSDC"] }),
    ];
    const { upcoming } = selectStudentEvents(events, NOW, {
      ...DEFAULT_EVENTS_VIEW,
      formatCode: "PF",
    });
    expect(upcoming.map((e) => e.id)).toEqual(["pf", "bp"]);
  });

  it("按形式：线上只看得到线上；「地点待定」两边都不属于", () => {
    const events = [
      event({ id: "online", venue: null, meetingUrl: "https://meet.invalid/x" }),
      event({ id: "venue", venue: "A101", meetingUrl: null }),
      event({ id: "unknown", venue: null, meetingUrl: null }),
    ];
    const online = selectStudentEvents(events, NOW, {
      ...DEFAULT_EVENTS_VIEW,
      location: "online",
    }).upcoming;
    expect(online.map((e) => e.id)).toEqual(["online"]);

    const inPerson = selectStudentEvents(events, NOW, {
      ...DEFAULT_EVENTS_VIEW,
      location: "in_person",
    }).upcoming;
    expect(inPerson.map((e) => e.id)).toEqual(["venue"]);
  });

  it("按报名状态：已报名（含已签到）与未报名互补", () => {
    const events = [
      event({ id: "registered", myRegistrationStatus: "registered" }),
      event({ id: "checked_in", myRegistrationStatus: "checked_in" }),
      event({ id: "none", myRegistrationStatus: null }),
      event({ id: "cancelled", myRegistrationStatus: "cancelled" }),
    ];
    const registered = selectStudentEvents(events, NOW, {
      ...DEFAULT_EVENTS_VIEW,
      registration: "registered",
    }).upcoming;
    expect(registered.map((e) => e.id)).toEqual(["registered", "checked_in"]);

    const notRegistered = selectStudentEvents(events, NOW, {
      ...DEFAULT_EVENTS_VIEW,
      registration: "not_registered",
    }).upcoming;
    // 取消过的算"未报名" —— 他确实没有有效报名
    expect(notRegistered.map((e) => e.id)).toEqual(["none", "cancelled"]);
  });

  it("多个筛选是**同时**生效的", () => {
    const events = [
      event({
        id: "hit",
        enabledFormatCodes: ["PF"],
        venue: null,
        meetingUrl: "https://x.invalid",
        myRegistrationStatus: "registered",
      }),
      event({
        id: "wrong-format",
        enabledFormatCodes: ["BP"],
        venue: null,
        meetingUrl: "https://x.invalid",
        myRegistrationStatus: "registered",
      }),
      event({
        id: "wrong-location",
        enabledFormatCodes: ["PF"],
        myRegistrationStatus: "registered",
      }),
      event({
        id: "wrong-registration",
        enabledFormatCodes: ["PF"],
        venue: null,
        meetingUrl: "https://x.invalid",
      }),
    ];
    const { upcoming } = selectStudentEvents(events, NOW, {
      ...DEFAULT_EVENTS_VIEW,
      formatCode: "PF",
      location: "online",
      registration: "registered",
    });
    expect(upcoming.map((e) => e.id)).toEqual(["hit"]);
  });

  it("分段上的数量就是筛选之后的数量（先筛选、再分段）", () => {
    const events = [
      event({ id: "a", enabledFormatCodes: ["PF"], startsAt: "2026-10-20T10:00:00Z" }),
      event({ id: "b", enabledFormatCodes: ["BP"], startsAt: "2026-10-20T10:00:00Z" }),
      event({ id: "c", enabledFormatCodes: ["PF"], startsAt: "2026-09-01T10:00:00Z" }),
    ];
    const { upcoming, past } = selectStudentEvents(events, NOW, {
      ...DEFAULT_EVENTS_VIEW,
      formatCode: "PF",
    });
    // 不能出现"标签写着 2、点进去只有 1"的情况
    expect(upcoming).toHaveLength(1);
    expect(past).toHaveLength(1);
  });
});

describe("网址参数：乱填一律退回默认，不报错", () => {
  const FORMATS = ["BP", "PF"];

  it("空参数 → 默认视图（即将到来、不限）", () => {
    expect(parseEventsView({}, FORMATS)).toEqual(DEFAULT_EVENTS_VIEW);
  });

  it("分段只认 upcoming / past", () => {
    expect(parseEventsView({ tab: "past" }, FORMATS).tab).toBe("past");
    for (const bad of ["123", "", "UPCOMING", "upcoming ", "drop table"]) {
      expect(parseEventsView({ tab: bad }, FORMATS).tab, `tab=${bad}`).toBe("upcoming");
    }
  });

  it("赛制只认**当前真实存在**的代码 —— 已删除的赛制退回「不限」", () => {
    expect(parseEventsView({ format: "PF" }, FORMATS).formatCode).toBe("PF");
    // 这一条是重点：退回"不限"而不是"一个永远筛不到东西的条件"
    expect(parseEventsView({ format: "已删除的赛制" }, FORMATS).formatCode).toBeNull();
    expect(parseEventsView({ format: "<script>alert(1)</script>" }, FORMATS).formatCode).toBeNull();
  });

  it("形式与报名状态只认自己那几个值", () => {
    expect(parseEventsView({ location: "online" }, FORMATS).location).toBe("online");
    expect(parseEventsView({ location: "in_person" }, FORMATS).location).toBe("in_person");
    expect(parseEventsView({ location: "随便写的" }, FORMATS).location).toBe("all");

    expect(parseEventsView({ registration: "registered" }, FORMATS).registration).toBe(
      "registered",
    );
    expect(parseEventsView({ registration: "x" }, FORMATS).registration).toBe("all");
  });

  it("同一个参数出现多次时取第一个，不报错", () => {
    expect(parseEventsView({ tab: ["past", "upcoming"] }, FORMATS).tab).toBe("past");
  });
});

describe("链接生成", () => {
  it("默认值不写进网址（同一个页面只有一个网址）", () => {
    expect(buildEventsHref(DEFAULT_EVENTS_VIEW)).toBe("/student/events");
  });

  it("切换分段时**保留**其它筛选条件", () => {
    const view = { ...DEFAULT_EVENTS_VIEW, formatCode: "PF", location: "online" as const };
    expect(buildEventsHref(view, { tab: "past" })).toBe(
      "/student/events?tab=past&format=PF&location=online",
    );
  });

  it("改一项不影响其它项", () => {
    const view = {
      tab: "past" as const,
      formatCode: "PF",
      location: "all" as const,
      registration: "registered" as const,
    };
    expect(buildEventsHref(view, { formatCode: "BP" })).toBe(
      "/student/events?tab=past&format=BP&registration=registered",
    );
  });

  it("清除筛选只清筛选，不动当前分段", () => {
    const view = {
      tab: "past" as const,
      formatCode: "PF",
      location: "online" as const,
      registration: "all" as const,
    };
    expect(buildEventsHref(view, { formatCode: null, location: "all", registration: "all" })).toBe(
      "/student/events?tab=past",
    );
  });

  it("hasActiveFilters 只对筛选敏感，对分段不敏感", () => {
    expect(hasActiveFilters(DEFAULT_EVENTS_VIEW)).toBe(false);
    expect(hasActiveFilters({ ...DEFAULT_EVENTS_VIEW, tab: "past" })).toBe(false);
    expect(hasActiveFilters({ ...DEFAULT_EVENTS_VIEW, formatCode: "PF" })).toBe(true);
    expect(hasActiveFilters({ ...DEFAULT_EVENTS_VIEW, location: "online" })).toBe(true);
    expect(hasActiveFilters({ ...DEFAULT_EVENTS_VIEW, registration: "registered" })).toBe(true);
  });
});
