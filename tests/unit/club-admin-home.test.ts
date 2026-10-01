// @vitest-environment node
import { describe, expect, it } from "vitest";

import {
  needsAttention,
  selectFollowingEvents,
  selectOperationalEvent,
  type ClubAdminEvent,
  type ClubAdminHomeInput,
  type FeaturedEventSnapshot,
} from "@/lib/domain/club-admin-home";

/**
 * 俱乐部管理首页的判断（规范 §11.1）。
 *
 * 这一页的全部价值在于**有没有漏掉该提醒的事**，而漏掉是不会报错的：
 * 少一条提醒，管理员就是不知道有 3 份评分表没交。
 * 所以这些用例逐条覆盖规范点名的五类，并固定排序。
 */

const NOW = new Date("2026-10-15T04:00:00Z");

function event(overrides: Partial<ClubAdminEvent> & { id: string }): ClubAdminEvent {
  return {
    title: `活动 ${overrides.id}`,
    status: "registration_open",
    eventDate: "2026-10-20",
    startsAt: "2026-10-20T10:00:00Z",
    registrationClosesAt: "2026-10-18T10:00:00Z",
    ...overrides,
  };
}

/** 一份"什么都好"的快照；各用例只改一处。 */
function snapshot(overrides: Partial<FeaturedEventSnapshot> = {}): FeaturedEventSnapshot {
  return {
    eventId: "e1",
    registeredCount: 42,
    registrationIssueCount: 0,
    matchCount: 7,
    unassignedJudgeMatchCount: 0,
    ballotsUnsubmittedCount: 0,
    ballotsExpectedCount: 7,
    unresolvedReviewCount: 0,
    ...overrides,
  };
}

function input(overrides: Partial<ClubAdminHomeInput> = {}): ClubAdminHomeInput {
  return {
    events: [event({ id: "e1" })],
    featured: snapshot(),
    failedEmailCount: 0,
    now: NOW,
    ...overrides,
  };
}

describe("该盯哪一场活动", () => {
  it("有正在进行的（live/ready/pairing）就先看它，而不是下一场", () => {
    const result = selectOperationalEvent(
      [
        event({ id: "next", startsAt: "2026-10-20T10:00:00Z" }),
        event({ id: "live", status: "live", startsAt: "2026-10-16T10:00:00Z" }),
      ],
      NOW,
    );
    expect(result.kind).toBe("in-progress");
    expect(result.event?.id).toBe("live");
  });

  it("没有正在进行的，就取最近的一场未来活动", () => {
    const result = selectOperationalEvent(
      [
        event({ id: "far", startsAt: "2026-11-01T10:00:00Z" }),
        event({ id: "soon", startsAt: "2026-10-18T10:00:00Z" }),
      ],
      NOW,
    );
    expect(result.kind).toBe("upcoming");
    expect(result.event?.id).toBe("soon");
  });

  it("草稿/已取消/已归档不会出现在首页（管理员看的是要办的活動）", () => {
    const result = selectOperationalEvent(
      [
        event({ id: "draft", status: "draft" }),
        event({ id: "cancelled", status: "cancelled" }),
        event({ id: "archived", status: "archived" }),
      ],
      NOW,
    );
    expect(result.kind).toBe("none");
    expect(result.event).toBeNull();
  });

  it("什么都没有时返回 none（页面据此显示「新建活动」）", () => {
    expect(selectOperationalEvent([], NOW).kind).toBe("none");
  });

  it("之后的几场里不含被选中的那场，且从近到远", () => {
    const events = [
      event({ id: "e1", startsAt: "2026-10-20T10:00:00Z" }),
      event({ id: "e2", startsAt: "2026-10-27T10:00:00Z" }),
      event({ id: "e3", startsAt: "2026-11-03T10:00:00Z" }),
    ];
    expect(selectFollowingEvents(events, NOW, "e1").map((e) => e.id)).toEqual(["e2", "e3"]);
  });

  it("过去的活动不在「之后的活动」里", () => {
    const events = [event({ id: "past", startsAt: "2026-09-01T10:00:00Z" })];
    expect(selectFollowingEvents(events, NOW, null)).toEqual([]);
  });
});

describe("需要处理：规范点名的五类一条都不能漏", () => {
  it("没人处理的学生复核请求", () => {
    const items = needsAttention(input({ featured: snapshot({ unresolvedReviewCount: 3 }) }));
    expect(items.map((item) => item.key)).toContain("unresolved-reviews");
    expect(items[0]?.label).toContain("3 条");
  });

  it("没有裁判的比赛", () => {
    const items = needsAttention(input({ featured: snapshot({ unassignedJudgeMatchCount: 2 }) }));
    expect(items.map((item) => item.key)).toContain("unassigned-judges");
  });

  it("报名里需要处理的人（没填偏好 / 没有合格赛制）", () => {
    const items = needsAttention(input({ featured: snapshot({ registrationIssueCount: 1 }) }));
    expect(items.map((item) => item.key)).toContain("registration-issues");
  });

  it("有人报名但还没生成比赛", () => {
    const items = needsAttention(
      input({ featured: snapshot({ matchCount: 0, registeredCount: 10 }) }),
    );
    expect(items.map((item) => item.key)).toContain("no-matches");
  });

  it("还没提交的评分表（并说明应提交多少份）", () => {
    const items = needsAttention(
      input({ featured: snapshot({ ballotsUnsubmittedCount: 2, ballotsExpectedCount: 7 }) }),
    );
    const item = items.find((entry) => entry.key === "ballots-outstanding");
    expect(item?.label).toContain("2 份");
    expect(item?.label).toContain("7 份");
  });

  it("发送失败的邮件（跨活动，指向邮件队列）", () => {
    const items = needsAttention(input({ failedEmailCount: 4 }));
    const item = items.find((entry) => entry.key === "failed-emails");
    expect(item?.href).toBe("/admin/email");
    expect(item?.severity).toBe("high");
  });

  it("都正常时一条提醒都没有（不要为了填满页面而编一条）", () => {
    expect(needsAttention(input())).toEqual([]);
  });
});

describe("每条提醒都必须能点进去处理", () => {
  it("全部指向这场活动里的具体页面（或邮件队列）", () => {
    const items = needsAttention(
      input({
        featured: snapshot({
          unresolvedReviewCount: 1,
          unassignedJudgeMatchCount: 1,
          registrationIssueCount: 1,
          ballotsUnsubmittedCount: 1,
        }),
        failedEmailCount: 1,
      }),
    );
    expect(items.length).toBeGreaterThan(0);
    for (const item of items) {
      expect(item.href, `${item.key} 没有入口`).toMatch(/^\/manage\/events\/e1\/|^\/admin\/email$/);
    }
  });

  it("**只报警不给入口**是不允许的 —— href 不能是空字符串", () => {
    const items = needsAttention(input({ failedEmailCount: 1 }));
    for (const item of items) expect(item.href).not.toBe("");
  });
});

describe("排序按严重程度，且必须是确定的", () => {
  it("high 在 medium 前面", () => {
    const items = needsAttention(
      input({
        featured: snapshot({
          unresolvedReviewCount: 1, // high
          registrationIssueCount: 1, // medium
        }),
      }),
    );
    expect(items[0]?.severity).toBe("high");
    expect(items[items.length - 1]?.severity).toBe("medium");
  });

  it("同一个输入重复调用得到完全相同的顺序（界面不能闪）", () => {
    const data = input({
      featured: snapshot({
        unresolvedReviewCount: 1,
        unassignedJudgeMatchCount: 1,
        registrationIssueCount: 1,
        ballotsUnsubmittedCount: 1,
      }),
      failedEmailCount: 1,
    });
    const first = needsAttention(data).map((item) => item.key);
    const second = needsAttention(data).map((item) => item.key);
    expect(second).toEqual(first);
    // 同严重程度内部按 order 排：复核(10) → 邮件(15) → 裁判(20) → 报名(30) → 评分表(50)
    expect(first).toEqual([
      "unresolved-reviews",
      "failed-emails",
      "unassigned-judges",
      "registration-issues",
      "ballots-outstanding",
    ]);
  });
});

describe("没有选中活动时也不能崩", () => {
  it("featured 为 null 时只报跨活动的问题", () => {
    const items = needsAttention(input({ featured: null, failedEmailCount: 2 }));
    expect(items.map((item) => item.key)).toEqual(["failed-emails"]);
  });
});
