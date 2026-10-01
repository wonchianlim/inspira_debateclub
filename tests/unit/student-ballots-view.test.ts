// @vitest-environment node
import { describe, expect, it } from "vitest";

import {
  anonymousJudgeLabel,
  groupPublishedBallots,
  type GroupableBallot,
} from "@/lib/domain/student-ballots-view";

/**
 * 学生评分表的**分组与顺序**（规范 §8.7）。
 *
 * ⚠️ 这些用例存在的原因：一场比赛可以有**多位裁判的评分表**
 * （数据库约束是 `unique (match_id, judge_id)`），而学生端原来把每一份
 * 平铺成一张几乎一样的卡片、没有任何说明 —— 看起来像系统坏了。
 */

function ballot(overrides: Partial<GroupableBallot> & { ballotId: string }): GroupableBallot {
  return {
    matchId: "match-1",
    scheduledStart: "2026-10-20T10:00:00.000Z",
    ...overrides,
  };
}

describe("按比赛分组", () => {
  it("同一场的几份评分表放进同一组", () => {
    const groups = groupPublishedBallots([
      ballot({ ballotId: "b1", matchId: "m1" }),
      ballot({ ballotId: "b2", matchId: "m1" }),
      ballot({ ballotId: "b3", matchId: "m2" }),
    ]);
    expect(groups).toHaveLength(2);
    expect(groups[0]?.matchId).toBe("m1");
    expect(groups[0]?.documents).toHaveLength(2);
    expect(groups[1]?.documents).toHaveLength(1);
  });

  it("组内只有一份时不加「裁判 1」这种废话", () => {
    const groups = groupPublishedBallots([ballot({ ballotId: "b1", matchId: "m1" })]);
    expect(groups[0]?.documents[0]?.anonymousLabel).toBeNull();
  });

  it("组内有多份时逐份编号（匿名，不公开姓名）", () => {
    const groups = groupPublishedBallots([
      ballot({ ballotId: "b1", matchId: "m1" }),
      ballot({ ballotId: "b2", matchId: "m1" }),
      ballot({ ballotId: "b3", matchId: "m1" }),
    ]);
    expect(groups[0]?.documents.map((entry) => entry.anonymousLabel)).toEqual([
      anonymousJudgeLabel(0),
      anonymousJudgeLabel(1),
      anonymousJudgeLabel(2),
    ]);
    expect(anonymousJudgeLabel(0)).toBe("Judge 1");
  });

  it("分组不改变传入的数组（纯函数）", () => {
    const input = [ballot({ ballotId: "b1", matchId: "m1" })];
    groupPublishedBallots(input);
    expect(input[0]?.ballotId).toBe("b1");
  });
});

describe("顺序必须是确定的（否则刷新一次裁判编号就对调）", () => {
  it("新的在前", () => {
    const groups = groupPublishedBallots([
      ballot({ ballotId: "old", matchId: "m-old", scheduledStart: "2026-09-01T10:00:00.000Z" }),
      ballot({ ballotId: "new", matchId: "m-new", scheduledStart: "2026-10-20T10:00:00.000Z" }),
    ]);
    expect(groups.map((group) => group.matchId)).toEqual(["m-new", "m-old"]);
  });

  it("开始时间相同时用 ballotId 兜底 —— 同一个输入必须得到同一个输出", () => {
    // 刻意用两组顺序不同的输入，结果必须一致
    const a = [
      ballot({ ballotId: "zzz", matchId: "m1" }),
      ballot({ ballotId: "aaa", matchId: "m1" }),
    ];
    const b = [
      ballot({ ballotId: "aaa", matchId: "m1" }),
      ballot({ ballotId: "zzz", matchId: "m1" }),
    ];
    const labelsFor = (input: GroupableBallot[]) =>
      groupPublishedBallots(input)[0]?.documents.map((entry) => entry.ballot.ballotId);
    expect(labelsFor(a)).toEqual(["aaa", "zzz"]);
    expect(labelsFor(b)).toEqual(["aaa", "zzz"]);
  });

  it("只有 start 与 matchId 都相同时才轮到 ballotId —— 先按场次时间排", () => {
    const groups = groupPublishedBallots([
      ballot({ ballotId: "b2", matchId: "m2", scheduledStart: "2026-10-20T10:00:00.000Z" }),
      ballot({ ballotId: "b1", matchId: "m1", scheduledStart: "2026-10-21T10:00:00.000Z" }),
    ]);
    expect(groups.map((group) => group.matchId)).toEqual(["m1", "m2"]);
  });
});
