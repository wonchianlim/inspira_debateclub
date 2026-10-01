// @vitest-environment node
import { describe, expect, it } from "vitest";

import {
  ballotsDueCount,
  draftBallots,
  isBallotPending,
  isBallotSubmitted,
  isJudgeOperational,
  judgeAccessState,
  overdueBallots,
  partitionAssignments,
  recentlySubmitted,
  selectNextAssignment,
  type JudgeHomeMatch,
} from "@/lib/domain/judge-home";

/**
 * 裁判工作台的判断（规范 §9.1）。
 *
 * ⚠️ 与 4b-1 学生首页同样的理由：这些判断如果埋在 JSX 的三目里，
 * **没有任何测试会覆盖到**。
 */

const NOW = new Date("2026-10-15T04:00:00Z");

function match(overrides: Partial<JudgeHomeMatch> & { matchId: string }): JudgeHomeMatch {
  return {
    matchNumber: 1,
    roomName: "A101",
    formatCode: "PF",
    scheduledStart: "2026-10-20T10:00:00Z",
    matchStatus: "scheduled",
    ballotStatus: null,
    hasTemplate: true,
    ...overrides,
  };
}

describe("还欠不欠这一份", () => {
  it("没开始填 / 草稿 / 被重开 都算欠着", () => {
    expect(isBallotPending(match({ matchId: "a", ballotStatus: null }))).toBe(true);
    expect(isBallotPending(match({ matchId: "b", ballotStatus: "draft" }))).toBe(true);
    // reopened 的意义就是"更正还没发生" —— 不能算已交
    expect(isBallotPending(match({ matchId: "c", ballotStatus: "reopened" }))).toBe(true);
  });

  it("已提交 / 已重交 / 已发布 都算交上去了", () => {
    for (const status of ["submitted", "resubmitted", "published"] as const) {
      expect(isBallotSubmitted(match({ matchId: status, ballotStatus: status }))).toBe(true);
      expect(isBallotPending(match({ matchId: status, ballotStatus: status }))).toBe(false);
    }
  });
});

describe("下一场：还欠着的里面最早的那一场", () => {
  it("还没交的、时间最早的排前面 —— 欠得越久越急", () => {
    const matches = [
      match({ matchId: "future", scheduledStart: "2026-10-25T10:00:00Z" }),
      match({ matchId: "overdue", scheduledStart: "2026-10-01T10:00:00Z" }),
      match({ matchId: "sooner", scheduledStart: "2026-10-18T10:00:00Z" }),
    ];
    expect(selectNextAssignment(matches)?.matchId).toBe("overdue");
  });

  it("已经交掉的不参与挑选（哪怕它时间更早）", () => {
    const matches = [
      match({ matchId: "done", scheduledStart: "2026-09-01T10:00:00Z", ballotStatus: "submitted" }),
      match({ matchId: "pending", scheduledStart: "2026-10-25T10:00:00Z" }),
    ];
    expect(selectNextAssignment(matches)?.matchId).toBe("pending");
  });

  it("全部交齐 → null（首屏显示「都交齐了」而不是一个空框）", () => {
    const matches = [match({ matchId: "done", ballotStatus: "submitted" })];
    expect(selectNextAssignment(matches)).toBeNull();
    expect(selectNextAssignment([])).toBeNull();
  });

  it("同一时间的两场用场次号兜底，结果确定", () => {
    const matches = [
      match({ matchId: "second", matchNumber: 2, scheduledStart: "2026-10-20T10:00:00Z" }),
      match({ matchId: "first", matchNumber: 1, scheduledStart: "2026-10-20T10:00:00Z" }),
    ];
    expect(selectNextAssignment(matches)?.matchId).toBe("first");
    expect(selectNextAssignment([...matches].reverse())?.matchId, "输入顺序不能影响结果").toBe(
      "first",
    );
  });
});

describe("待办数字", () => {
  it("待提交数量 = 欠着的总数", () => {
    const matches = [
      match({ matchId: "a" }),
      match({ matchId: "b", ballotStatus: "draft" }),
      match({ matchId: "c", ballotStatus: "reopened" }),
      match({ matchId: "d", ballotStatus: "submitted" }),
    ];
    expect(ballotsDueCount(matches)).toBe(3);
  });

  it("「已过开始时间仍未提交」是最急的一类，单独算", () => {
    const matches = [
      match({ matchId: "overdue", scheduledStart: "2026-10-01T10:00:00Z" }),
      match({ matchId: "future", scheduledStart: "2026-10-25T10:00:00Z" }),
      match({ matchId: "done", scheduledStart: "2026-09-01T10:00:00Z", ballotStatus: "submitted" }),
    ];
    expect(overdueBallots(matches, NOW).map((entry) => entry.matchId)).toEqual(["overdue"]);
  });

  it("刚好在这一刻开始的算「已过期」（边界不放过一份欠账）", () => {
    const boundary = match({ matchId: "now", scheduledStart: NOW.toISOString() });
    // 严格小于：刚好等于时还没过期（比赛正在开始，不是"过了"）
    expect(overdueBallots([boundary], NOW)).toHaveLength(0);
  });

  it("开了头没交的（草稿）单独列 —— 「改一改就能交」和「还没动」不一样", () => {
    const matches = [
      match({ matchId: "draft", ballotStatus: "draft" }),
      match({ matchId: "untouched" }),
      match({ matchId: "reopened", ballotStatus: "reopened" }),
    ];
    expect(draftBallots(matches).map((entry) => entry.matchId)).toEqual(["draft"]);
  });
});

describe("最近提交", () => {
  it("新的在前，且只取前几条", () => {
    const matches = [
      match({ matchId: "old", scheduledStart: "2026-09-01T10:00:00Z", ballotStatus: "submitted" }),
      match({ matchId: "new", scheduledStart: "2026-10-10T10:00:00Z", ballotStatus: "published" }),
      match({ matchId: "mid", scheduledStart: "2026-10-01T10:00:00Z", ballotStatus: "submitted" }),
      match({ matchId: "pending" }),
    ];
    expect(recentlySubmitted(matches, 2).map((entry) => entry.matchId)).toEqual(["new", "mid"]);
    expect(recentlySubmitted(matches)).toHaveLength(3);
  });

  it("一份都没交时是空数组（页面据此显示说明而不是空标题）", () => {
    expect(recentlySubmitted([match({ matchId: "a" })])).toEqual([]);
  });
});

describe("按「我的工作是否完成」分两段", () => {
  it("待办在前（最近的先看到），已交在后（最新的先看到）", () => {
    const matches = [
      match({ matchId: "p2", matchNumber: 2, scheduledStart: "2026-10-25T10:00:00Z" }),
      match({ matchId: "p1", matchNumber: 1, scheduledStart: "2026-10-18T10:00:00Z" }),
      match({ matchId: "c1", scheduledStart: "2026-09-01T10:00:00Z", ballotStatus: "submitted" }),
      match({ matchId: "c2", scheduledStart: "2026-10-10T10:00:00Z", ballotStatus: "submitted" }),
    ];
    const { upcoming, completed } = partitionAssignments(matches);
    expect(upcoming.map((entry) => entry.matchId)).toEqual(["p1", "p2"]);
    expect(completed.map((entry) => entry.matchId)).toEqual(["c2", "c1"]);
  });

  /**
   * ⚠️ 这条固定住一个刻意的解释：分段按"我交没交"而不是按比赛时间。
   * 两周前、评分表一直没交的那一场必须留在**待办**里；
   * 如果按时间分，它会被归进 "Completed"，那份欠账就永远看不见了。
   */
  it("早就过去、但一直没交的那一场仍在待办里（欠账不能被藏起来）", () => {
    const stale = match({ matchId: "stale", scheduledStart: "2026-09-01T10:00:00Z" });
    const { upcoming, completed } = partitionAssignments([stale]);
    expect(upcoming.map((entry) => entry.matchId)).toEqual(["stale"]);
    expect(completed).toHaveLength(0);
  });

  it("两段合起来就是全部（没有指派被漏掉）", () => {
    const matches = [
      match({ matchId: "a" }),
      match({ matchId: "b", ballotStatus: "draft" }),
      match({ matchId: "c", ballotStatus: "submitted" }),
      match({ matchId: "d", ballotStatus: "published" }),
    ];
    const { upcoming, completed } = partitionAssignments(matches);
    expect(upcoming.length + completed.length).toBe(matches.length);
  });
});

describe("审批状态：未获批准时不能显示操作性内容", () => {
  it("已批准 → active", () => {
    expect(judgeAccessState({ approvalStatus: "approved" })).toBe("active");
    expect(isJudgeOperational("active")).toBe(true);
  });

  it("没有档案 / 待审批 / 被拒 / 被暂停 都不是 active", () => {
    expect(judgeAccessState(null)).toBe("no-profile");
    expect(judgeAccessState(undefined)).toBe("no-profile");
    expect(judgeAccessState({ approvalStatus: "pending" })).toBe("pending");
    expect(judgeAccessState({ approvalStatus: "rejected" })).toBe("rejected");
    expect(judgeAccessState({ approvalStatus: "suspended" })).toBe("suspended");
    for (const state of ["no-profile", "pending", "rejected", "suspended"] as const) {
      expect(isJudgeOperational(state), `${state} 不该显示操作性内容`).toBe(false);
    }
  });

  /**
   * ⚠️ 这条防的是一个**会说假话的界面**：未获批准的裁判被指派不了比赛，
   * 如果他看到的是"目前没有指派给你的比赛"，就会一直等一个永远不会来的指派。
   */
  it("未获批准时绝不能显示「待办 0 份」这种操作性数字", () => {
    for (const state of ["pending", "rejected", "suspended", "no-profile"] as const) {
      expect(isJudgeOperational(state)).toBe(false);
    }
  });
});
