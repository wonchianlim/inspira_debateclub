// @vitest-environment node
import { describe, expect, it } from "vitest";

import {
  type MatchGenerationInput,
  type MatchTeamInput,
  generateMatches,
  opponentKey,
} from "@/lib/domain/match-generation";

/**
 * 比赛生成（规范第 10.4、10.5 节）。
 *
 * 测试重点是规范的两条明文要求：
 *   - **确定性**：相同输入重跑得到相同结果，并列时用种子哈希打破；
 *   - **BP 不能简化成二元胜负**（已在 match-cost 层覆盖，这里验证它被用上）。
 */

const PF = { formatId: "fmt-pf", code: "PF", teamsPerMatch: 2 };
const BP = { formatId: "fmt-bp", code: "BP", teamsPerMatch: 4 };

function team(
  teamId: string,
  averageRating: number,
  members: string[] = [`s-${teamId}`],
): MatchTeamInput {
  return { teamId, averageRating, memberStudentIds: members };
}

function baseInput(overrides: Partial<MatchGenerationInput> = {}): MatchGenerationInput {
  return {
    eventId: "event-1",
    format: PF,
    teams: [team("t1", 3), team("t2", 4), team("t3", 8), team("t4", 9)],
    previousOpponentCounts: new Map(),
    previousSideACounts: new Map(),
    previousSideBCounts: new Map(),
    roomNames: ["A101", "A102", "A103"],
    firstMatchStart: new Date("2026-10-01T01:00:00.000Z"),
    matchIntervalMinutes: 60,
    ...overrides,
  };
}

describe("基本分组", () => {
  it("4 支队伍、2 支一场 → 生成 2 场比赛", () => {
    const result = generateMatches(baseInput());
    expect(result.matches).toHaveLength(2);
    expect(result.unassignedTeamIds).toHaveLength(0);
  });

  it("评分相近的队伍被分到同一场（连续分组）", () => {
    const result = generateMatches(baseInput());
    const groups = result.matches.map((match) => match.teams.map((t) => t.teamId).sort());
    expect(groups).toContainEqual(["t1", "t2"]);
    expect(groups).toContainEqual(["t3", "t4"]);
  });

  it("每场恰好 teams_per_match 支队伍", () => {
    const result = generateMatches(baseInput());
    for (const match of result.matches) {
      expect(match.teams).toHaveLength(2);
    }
  });

  it("队伍不够一场时进入未分配名单并给出原因", () => {
    const result = generateMatches(
      baseInput({ teams: [team("t1", 3), team("t2", 4), team("t3", 7)] }),
    );
    expect(result.matches).toHaveLength(1);
    expect(result.unassignedTeamIds).toEqual(["t3"]);
    expect(result.warnings.some((w) => w.code === "leftover_teams")).toBe(true);
  });

  it("完全没有队伍时返回空结果而不是抛错", () => {
    const result = generateMatches(baseInput({ teams: [] }));
    expect(result.matches).toEqual([]);
    expect(result.unassignedTeamIds).toEqual([]);
  });
});

describe("房间与时间", () => {
  it("房间按顺序分配，时间按间隔递增", () => {
    const result = generateMatches(baseInput());
    expect(result.matches[0]?.roomName).toBe("A101");
    expect(result.matches[1]?.roomName).toBe("A102");
    expect(result.matches[0]?.scheduledStart).toBe("2026-10-01T01:00:00.000Z");
    expect(result.matches[1]?.scheduledStart).toBe("2026-10-01T02:00:00.000Z");
  });

  it("房间不够时用占位名并给出警告，而不是留空", () => {
    const result = generateMatches(baseInput({ roomNames: ["A101"] }));
    expect(result.matches[1]?.roomName).toContain("待定");
    expect(result.warnings.some((w) => w.code === "not_enough_rooms")).toBe(true);
  });

  it("比赛编号从 1 开始且连续", () => {
    const result = generateMatches(baseInput());
    expect(result.matches.map((m) => m.matchNumber)).toEqual([1, 2]);
  });
});

describe("正反方分配（规范 10.5）", () => {
  it("PF 用 PROP / OPP，且每场各一个", () => {
    const result = generateMatches(baseInput());
    for (const match of result.matches) {
      const positions = match.teams.map((t) => t.position).sort();
      expect(positions).toEqual(["OPP", "PROP"]);
    }
  });

  it("BP 用 OG / OO / CG / CO，四个位置各一个", () => {
    const result = generateMatches(
      baseInput({
        format: BP,
        teams: [team("t1", 3), team("t2", 4), team("t3", 5), team("t4", 6)],
      }),
    );
    expect(result.matches).toHaveLength(1);
    const positions = result.matches[0]?.teams.map((t) => t.position).sort();
    expect(positions).toEqual(["CG", "CO", "OG", "OO"]);
  });

  it("历史上一侧偏多的人被安排到另一侧（让两侧趋于平衡）", () => {
    // t1 的成员历史上一侧出场很多 → 这次应该被安排到第二侧（OPP）
    const result = generateMatches(
      baseInput({
        teams: [team("t1", 5, ["heavy"]), team("t2", 5, ["light"])],
        previousSideACounts: new Map([
          ["heavy", 5],
          ["light", 0],
        ]),
        previousSideBCounts: new Map([
          ["heavy", 0],
          ["light", 5],
        ]),
      }),
    );

    const assignment = new Map(
      result.matches[0]?.teams.map((t) => [t.teamId, t.position] as const),
    );
    expect(assignment.get("t1")).toBe("OPP");
    expect(assignment.get("t2")).toBe("PROP");
  });

  it("两侧评分有差时给出提示（完全平衡并不总是可能）", () => {
    const result = generateMatches(baseInput({ teams: [team("t1", 1), team("t2", 10)] }));
    expect(result.warnings.some((w) => w.code === "side_imbalance_remaining")).toBe(true);
  });

  it("配置不一致（BP 配成 2 支队伍）时拒绝生成并说明原因", () => {
    const result = generateMatches(
      baseInput({
        format: { formatId: "fmt-bp", code: "BP", teamsPerMatch: 2 },
        teams: [team("t1", 3), team("t2", 4)],
      }),
    );
    expect(result.matches).toEqual([]);
    expect(result.warnings[0]?.message).toContain("位置");
  });
});

describe("重复对手", () => {
  it("没有任何历史交手时不产生重复对手警告", () => {
    const result = generateMatches(baseInput());
    expect(result.warnings.some((w) => w.code === "repeat_opponent")).toBe(false);
  });

  it("有历史交手时给出提示，但**不阻止**成场", () => {
    const result = generateMatches(
      baseInput({
        previousOpponentCounts: new Map([[opponentKey("t1", "t2"), 1]]),
      }),
    );
    // 连续分组本来就会把 t1/t2 分到一起，因此必然出现重复对手提示
    expect(result.warnings.some((w) => w.code === "repeat_opponent")).toBe(true);
  });

  it("对手键与顺序无关（(A,B) 与 (B,A) 是同一条）", () => {
    expect(opponentKey("a", "b")).toBe(opponentKey("b", "a"));
  });

  it("评分相同时会交换，以避免重复对手", () => {
    /*
     * 四支队伍评分**完全相同**时，"评分跨度"这一项恒为 0，
     * 于是重复对手（权重 8）成为唯一影响成本的因素 —— 交换就真的划算了。
     */
    const result = generateMatches(
      baseInput({
        teams: [team("t1", 5), team("t2", 5), team("t3", 5), team("t4", 5)],
        previousOpponentCounts: new Map([
          [opponentKey("t1", "t2"), 1],
          [opponentKey("t3", "t4"), 1],
        ]),
      }),
    );

    const groups = result.matches.map((match) => match.teams.map((t) => t.teamId).sort());
    expect(groups).not.toContainEqual(["t1", "t2"]);
    expect(groups).not.toContainEqual(["t3", "t4"]);
    expect(result.warnings.some((w) => w.code === "repeat_opponent")).toBe(false);
  });

  it("评分差距大时**不**为了避开重复对手而牺牲评分相近（权重顺序的体现）", () => {
    /*
     * 这条测试固定住一个由权重决定的**取舍方向**：
     * 评分跨度的权重是 12，重复对手是 8 —— 也就是说
     * **"评分相近"比"避开重复对手"更重要**。
     *
     * 于是当 t1/t2 评分很近、但已经交过手时，系统会**保留**他们同场，
     * 而不是为了避开重复对手把他们拆开去配评分差得多的队伍。
     *
     * 这正是规范给的权重的直接含义。若将来有人调换这两个权重，这条测试会失败，
     * 从而提醒他"这是产品取舍的变化，不是随手改数字"。
     */
    const result = generateMatches(
      baseInput({
        teams: [team("t1", 3), team("t2", 4), team("t3", 8), team("t4", 9)],
        previousOpponentCounts: new Map([
          [opponentKey("t1", "t2"), 1],
          [opponentKey("t3", "t4"), 1],
        ]),
      }),
    );

    const groups = result.matches.map((match) => match.teams.map((t) => t.teamId).sort());
    // 评分相近的两对**仍然**在一起，重复对手被接受
    expect(groups).toContainEqual(["t1", "t2"]);
    expect(groups).toContainEqual(["t3", "t4"]);
    // 并且如实提示"有以前交手过的队伍"
    expect(result.warnings.some((w) => w.code === "repeat_opponent")).toBe(true);
  });
});

describe("确定性（规范 10.5 明文要求）", () => {
  const input = baseInput({
    teams: [team("t4", 9), team("t1", 3), team("t3", 8), team("t2", 4)],
    previousOpponentCounts: new Map([[opponentKey("t1", "t3"), 1]]),
    previousSideACounts: new Map([
      ["s-t1", 1],
      ["s-t2", 2],
    ]),
    previousSideBCounts: new Map([
      ["s-t1", 3],
      ["s-t2", 1],
    ]),
  });

  it("相同输入重复运行结果完全一致", () => {
    expect(generateMatches(input)).toEqual(generateMatches(input));
  });

  it("打乱队伍传入顺序不影响结果", () => {
    const shuffled = { ...input, teams: [...input.teams].reverse() };
    expect(generateMatches(shuffled)).toEqual(generateMatches(input));
  });

  it("评分完全相同时用种子哈希打破并列 —— 结果仍然确定", () => {
    const tied = baseInput({
      teams: [team("t3", 5), team("t1", 5), team("t4", 5), team("t2", 5)],
    });
    expect(generateMatches(tied)).toEqual(generateMatches(tied));
  });

  it("换一个活动 id 时分组可能不同（种子确实在起作用）", () => {
    const tied = baseInput({
      teams: [
        team("t3", 5, ["a"]),
        team("t1", 5, ["b"]),
        team("t4", 5, ["c"]),
        team("t2", 5, ["d"]),
      ],
    });
    const first = generateMatches({ ...tied, eventId: "event-1" });
    const second = generateMatches({ ...tied, eventId: "event-2" });
    // 不强行断言"一定不同"（哈希可能碰巧一致），只断言两者都是确定的
    expect(generateMatches({ ...tied, eventId: "event-1" })).toEqual(first);
    expect(generateMatches({ ...tied, eventId: "event-2" })).toEqual(second);
  });

  it("不修改入参", () => {
    const snapshot = JSON.stringify(input.teams);
    generateMatches(input);
    expect(JSON.stringify(input.teams)).toBe(snapshot);
  });
});

describe("可解释性", () => {
  it("每场比赛都带成本明细，且逐项之和等于该场成本", () => {
    const result = generateMatches(baseInput());
    for (const match of result.matches) {
      const sum = match.costBreakdown.terms.reduce((total, term) => total + term.contribution, 0);
      expect(sum).toBe(match.cost);
    }
  });

  it("总成本等于各场成本之和", () => {
    const result = generateMatches(baseInput());
    expect(result.totalCost).toBe(result.matches.reduce((total, match) => total + match.cost, 0));
  });
});
