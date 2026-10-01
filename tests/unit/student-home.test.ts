// @vitest-environment node
import { describe, expect, it } from "vitest";

import {
  heroAction,
  isNewStudent,
  primaryFormatCode,
  selectHomeMetrics,
  selectNextEvent,
  selectUpcomingEvents,
  type StudentHomeEvent,
} from "@/lib/domain/student-home";

/**
 * 学生首页的判断（规范 §8.1）。
 *
 * ⚠️ 这些判断原来（如果照常见写法）会埋在 JSX 的 filter 与三目里，
 * 而**没有任何测试会覆盖到页面里的三目**。所以它们被搬到了这里，
 * 每条规则都对着规范或领域规则里的一句话。
 */

const NOW = new Date("2026-10-15T04:00:00Z"); // 上海 12:00

function event(overrides: Partial<StudentHomeEvent> & { id: string }): StudentHomeEvent {
  return {
    title: `活动 ${overrides.id}`,
    status: "registration_open",
    timezone: "Asia/Shanghai",
    enabledFormatCount: 2,
    venue: "教学楼 A101",
    meetingUrl: null,
    startsAt: "2026-10-20T10:00:00Z",
    checkInOpensAt: "2026-10-20T09:30:00Z",
    registrationOpensAt: "2026-10-01T00:00:00Z",
    registrationClosesAt: "2026-10-18T00:00:00Z",
    myRegistrationStatus: null,
    ...overrides,
  };
}

describe("挑出「即将到来」的活动", () => {
  it("只留还没开始的，按开始时间从近到远", () => {
    const events = [
      event({ id: "far", startsAt: "2026-11-01T10:00:00Z" }),
      event({ id: "past", startsAt: "2026-10-01T10:00:00Z" }),
      event({ id: "soon", startsAt: "2026-10-16T10:00:00Z" }),
    ];
    expect(selectUpcomingEvents(events, NOW).map((entry) => entry.id)).toEqual(["soon", "far"]);
  });

  it("草稿 / 已取消 / 已归档一律不出现（学生不该看到管理员还在准备的活动）", () => {
    const events = [
      event({ id: "draft", status: "draft" }),
      event({ id: "cancelled", status: "cancelled" }),
      event({ id: "archived", status: "archived" }),
      event({ id: "open", status: "registration_open" }),
    ];
    expect(selectUpcomingEvents(events, NOW).map((entry) => entry.id)).toEqual(["open"]);
  });

  it("刚好在这一刻开始的活动算「即将到来」（边界不吞掉）", () => {
    const boundary = event({ id: "now", startsAt: NOW.toISOString() });
    expect(selectUpcomingEvents([boundary], NOW).map((entry) => entry.id)).toEqual(["now"]);
  });

  it("默认最多三场", () => {
    const events = Array.from({ length: 6 }, (_, index) =>
      event({ id: `e${index}`, startsAt: `2026-10-${20 + index}T10:00:00Z` }),
    );
    expect(selectUpcomingEvents(events, NOW)).toHaveLength(3);
    expect(selectUpcomingEvents(events, NOW, 5)).toHaveLength(5);
  });

  it("selectNextEvent 取最近的一场；没有则为 null", () => {
    const events = [
      event({ id: "later", startsAt: "2026-10-25T10:00:00Z" }),
      event({ id: "sooner", startsAt: "2026-10-18T10:00:00Z" }),
    ];
    expect(selectNextEvent(events, NOW)?.id).toBe("sooner");
    expect(
      selectNextEvent([event({ id: "past", startsAt: "2026-09-01T10:00:00Z" })], NOW),
    ).toBeNull();
  });
});

describe("hero 上的主按钮（规范 §8.1 的动作清单）", () => {
  it("报名开放且我还没报名 → 去报名", () => {
    const action = heroAction(event({ id: "a" }), NOW);
    expect(action.kind).toBe("register");
    expect(action.label).toBe("去报名");
    expect(action.href).toBe("/student/events/a");
  });

  it("报名还没开放 → 不显示报名，只能查看", () => {
    const action = heroAction(event({ id: "a", registrationOpensAt: "2026-10-19T00:00:00Z" }), NOW);
    expect(action.kind).toBe("view");
  });

  it("报名已截止且我没报名 → 只能查看", () => {
    const action = heroAction(
      event({ id: "a", registrationClosesAt: "2026-10-14T00:00:00Z" }),
      NOW,
    );
    expect(action.kind).toBe("view");
  });

  it("已报名 + 签到已开放 → 去签到", () => {
    const action = heroAction(
      event({
        id: "a",
        myRegistrationStatus: "registered",
        checkInOpensAt: "2026-10-15T03:00:00Z",
      }),
      NOW,
    );
    expect(action.kind).toBe("check-in");
    expect(action.label).toBe("去签到");
  });

  /**
   * ⚠️ 签到窗口用的是活动自己的 `check_in_opens_at`，
   * 不是写死的"开始前 30 分钟"。管理员改过设置之后两者会不相等。
   */
  it("已报名但签到还没开放 → 不显示签到（用活动自己的签到开放时刻）", () => {
    const action = heroAction(
      event({
        id: "a",
        myRegistrationStatus: "registered",
        checkInOpensAt: "2026-10-20T09:30:00Z",
      }),
      NOW,
    );
    expect(action.kind).toBe("view");
  });

  it("已签到 → 没有可做的事，只看详情", () => {
    const action = heroAction(
      event({
        id: "a",
        myRegistrationStatus: "checked_in",
        checkInOpensAt: "2026-10-01T00:00:00Z",
      }),
      NOW,
    );
    expect(action.kind).toBe("view");
  });

  it("已取消报名、窗口仍开放 → 可以重新报名", () => {
    const action = heroAction(event({ id: "a", myRegistrationStatus: "late_cancelled" }), NOW);
    expect(action.kind).toBe("register");
  });

  it("所有动作都指向学生端**真实存在**的活动详情页（不留死链）", () => {
    const cases = [
      event({ id: "x" }),
      event({
        id: "x",
        myRegistrationStatus: "registered",
        checkInOpensAt: "2026-10-01T00:00:00Z",
      }),
      event({ id: "x", myRegistrationStatus: "checked_in" }),
      event({ id: "x", registrationClosesAt: "2026-10-01T00:00:00Z" }),
    ];
    for (const entry of cases) {
      expect(heroAction(entry, NOW).href).toBe(`/student/events/${entry.id}`);
    }
  });
});

describe("指标卡：数据没有意义就不显示（规范 §8.1）", () => {
  it("一场都没打过时不显示「主要赛制」", () => {
    expect(
      selectHomeMetrics({ totalDebates: 0, primaryFormatCode: null, feedbackCount: 0 }),
    ).toEqual(["debates"]);
  });

  it("没有反馈时不显示「可看的反馈」（「0 条反馈」只是噪音）", () => {
    const keys = selectHomeMetrics({ totalDebates: 3, primaryFormatCode: "BP", feedbackCount: 0 });
    expect(keys).toEqual(["debates", "primaryFormat"]);
  });

  it("数据齐了就是三张，且不超过三张", () => {
    const keys = selectHomeMetrics({ totalDebates: 3, primaryFormatCode: "BP", feedbackCount: 2 });
    expect(keys).toEqual(["debates", "primaryFormat", "feedback"]);
    expect(keys.length).toBeLessThanOrEqual(3);
  });

  it("「已完成的辩论场次」总是显示 —— 0 也是一句有用的话", () => {
    expect(
      selectHomeMetrics({ totalDebates: 0, primaryFormatCode: null, feedbackCount: 0 }),
    ).toContain("debates");
  });
});

describe("主要赛制", () => {
  it("取打得最多的那个", () => {
    expect(
      primaryFormatCode([
        { formatCode: "PF", debates: 2 },
        { formatCode: "BP", debates: 5 },
      ]),
    ).toBe("BP");
  });

  it("并列时按赛制代码字母序，结果必须是确定的", () => {
    const first = primaryFormatCode([
      { formatCode: "PF", debates: 3 },
      { formatCode: "BP", debates: 3 },
    ]);
    // 反序输入得到同一个结果，否则学生每次刷新看到的"主要赛制"都可能不同
    const second = primaryFormatCode([
      { formatCode: "BP", debates: 3 },
      { formatCode: "PF", debates: 3 },
    ]);
    expect(first).toBe("BP");
    expect(second).toBe("BP");
  });

  it("没有任何场次时返回 null（不编一个赛制出来）", () => {
    expect(primaryFormatCode([])).toBeNull();
    expect(primaryFormatCode([{ formatCode: "PF", debates: 0 }])).toBeNull();
  });
});

describe("新学生判定", () => {
  it("没有活动、没打过、没反馈 → 是（显示引导，而不是空白框）", () => {
    expect(isNewStudent({ upcomingEventCount: 0, totalDebates: 0, feedbackCount: 0 })).toBe(true);
  });

  it("只要有其中任何一样，就不是新学生", () => {
    expect(isNewStudent({ upcomingEventCount: 1, totalDebates: 0, feedbackCount: 0 })).toBe(false);
    expect(isNewStudent({ upcomingEventCount: 0, totalDebates: 1, feedbackCount: 0 })).toBe(false);
    expect(isNewStudent({ upcomingEventCount: 0, totalDebates: 0, feedbackCount: 1 })).toBe(false);
  });
});
