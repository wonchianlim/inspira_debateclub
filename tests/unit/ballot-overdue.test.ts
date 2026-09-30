// @vitest-environment node
import { describe, expect, it } from "vitest";

import {
  OVERDUE_GRACE_MINUTES,
  checkBallotOverdue,
  selectOverdueBallots,
} from "@/lib/domain/ballot-overdue";
import { BALLOT_STATUSES } from "@/lib/domain/ballot-lifecycle";

const START = new Date("2026-05-01T10:00:00.000Z");
/** 比赛开始后的第 N 分钟 */
const at = (minutes: number) => new Date(START.getTime() + minutes * 60 * 1000);

describe("未超时的情况", () => {
  it("还没到宽限期 → 不算超时", () => {
    expect(checkBallotOverdue(START, null, at(0)).overdue).toBe(false);
    expect(checkBallotOverdue(START, "draft", at(89)).overdue).toBe(false);
  });

  it("正好卡在宽限期上 → 还不算超时（用 > 而不是 >=）", () => {
    expect(checkBallotOverdue(START, "draft", at(OVERDUE_GRACE_MINUTES)).overdue).toBe(false);
    expect(checkBallotOverdue(START, "draft", at(OVERDUE_GRACE_MINUTES + 1)).overdue).toBe(true);
  });

  it("已提交 / 已重新提交 / 已发布 → 永远不算超时", () => {
    for (const status of ["submitted", "resubmitted", "published"] as const) {
      expect(checkBallotOverdue(START, status, at(10_000)).overdue, status).toBe(false);
    }
  });
});

/**
 * ⚠️ `reopened` **算超时**，这是刻意的。
 *
 * 管理员重开是为了让裁判更正，而更正还没交回来 —— 那正是最需要跟进的状态。
 * 把它当成"已处理"会让最需要跟进的那一份从提醒里消失。
 */
describe("⚠️ 已重开（reopened）算超时", () => {
  it("reopened 超时", () => {
    const result = checkBallotOverdue(START, "reopened", at(200));
    expect(result.overdue).toBe(true);
    expect(result.message).toContain("重新提交");
  });

  it('草稿超时，且说明与"还没开始填"不同', () => {
    const notStarted = checkBallotOverdue(START, null, at(200));
    const draft = checkBallotOverdue(START, "draft", at(200));
    expect(notStarted.overdue).toBe(true);
    expect(draft.overdue).toBe(true);
    expect(notStarted.message).not.toBe(draft.message);
    expect(notStarted.message).toContain("还没有开始填写");
  });

  it("五种状态里的每一种都有明确的判定（没有漏掉的情况）", () => {
    for (const status of BALLOT_STATUSES) {
      const result = checkBallotOverdue(START, status, at(10_000));
      // 只有已交回的三类不算超时，其余都算
      const expected = status !== "submitted" && status !== "resubmitted" && status !== "published";
      expect(result.overdue, status).toBe(expected);
    }
  });
});

describe("超时时长", () => {
  it("正确算出超过多少分钟", () => {
    const result = checkBallotOverdue(START, null, at(OVERDUE_GRACE_MINUTES + 45));
    expect(result.minutesOverdue).toBe(45);
  });

  it("未超时时时长为 0", () => {
    expect(checkBallotOverdue(START, null, at(10)).minutesOverdue).toBe(0);
  });

  it("宽限期可注入（方便以后调整而不用改断言）", () => {
    expect(checkBallotOverdue(START, null, at(31), 30).overdue).toBe(true);
    expect(checkBallotOverdue(START, null, at(29), 30).overdue).toBe(false);
  });
});

describe("从一组评分表里挑出超时的", () => {
  const now = at(OVERDUE_GRACE_MINUTES + 100);

  it("只挑出真正超时的，并按超时从久到近排序", () => {
    const ballots = [
      { id: "a", scheduledStart: at(-200).toISOString(), status: "draft" as const },
      { id: "b", scheduledStart: at(-150).toISOString(), status: "submitted" as const },
      { id: "c", scheduledStart: at(-250).toISOString(), status: "reopened" as const },
      // 这场比赛才刚开始（相对 now 只有 50 分钟）→ 未超时
      { id: "d", scheduledStart: at(OVERDUE_GRACE_MINUTES + 50).toISOString(), status: null },
    ];
    const result = selectOverdueBallots(ballots, now);
    expect(result.map((entry) => entry.ballot.id)).toEqual(["c", "a"]);
  });

  it("没有超时的就返回空数组", () => {
    const ballots = [
      { id: "a", scheduledStart: at(OVERDUE_GRACE_MINUTES + 50).toISOString(), status: null },
      { id: "b", scheduledStart: at(-200).toISOString(), status: "published" as const },
    ];
    expect(selectOverdueBallots(ballots, now)).toHaveLength(0);
  });

  it("不修改入参", () => {
    const ballots = [{ id: "a", scheduledStart: at(-200).toISOString(), status: "draft" as const }];
    const snapshot = JSON.stringify(ballots);
    selectOverdueBallots(ballots, now);
    expect(JSON.stringify(ballots)).toBe(snapshot);
  });
});
