// @vitest-environment node
import { describe, expect, it } from "vitest";

import {
  MIN_DEBATES_FOR_TREND,
  type HistoryEntry,
  summarizeStudentHistory,
} from "@/lib/domain/student-history";

/**
 * 学生历史统计（Phase 8 / P8-2）。
 *
 * ⚠️ 规范明确要求："**Do not immediately create public rankings.**"
 * 因此这里专门有一节断言这个模块**算不出排名** ——
 * 接口只接受一个学生的数据，产出里也没有名次或百分位。
 */

function entry(overrides: Partial<HistoryEntry> = {}): HistoryEntry {
  return {
    formatCode: "WSDC",
    scheduledStart: "2026-05-01T10:00:00.000Z",
    outcome: "win",
    rank: null,
    speakerTotal: 70,
    speakerMax: 100,
    categoryScores: { style: 28, content: 28, strategy: 14 },
    categoryLabels: {
      style: { label: "表达", max: 40 },
      content: { label: "内容", max: 40 },
      strategy: { label: "策略", max: 20 },
    },
    ...overrides,
  };
}

describe("空数据不崩，也不硬给结论", () => {
  const empty = summarizeStudentHistory([]);

  it("全部为 0 / null，而不是抛错或 NaN", () => {
    expect(empty.totalDebates).toBe(0);
    expect(empty.wins).toBe(0);
    expect(empty.winRate).toBeNull();
    expect(empty.averageTotal).toBeNull();
    expect(empty.highestTotal).toBeNull();
    expect(empty.byFormat).toEqual([]);
  });

  it("没有数据时趋势是 unknown，而不是 flat", () => {
    expect(empty.recentTrend.direction).toBe("unknown");
    expect(empty.recentTrend.delta).toBeNull();
  });
});

describe("胜负与胜率", () => {
  it("分别统计胜、负，以及没有胜负概念的场次", () => {
    const history = summarizeStudentHistory([
      entry({ outcome: "win" }),
      entry({ outcome: "win" }),
      entry({ outcome: "loss" }),
      entry({ formatCode: "BP", outcome: null, rank: 1, speakerTotal: 75, speakerMax: 85 }),
    ]);
    expect(history.totalDebates).toBe(4);
    expect(history.wins).toBe(2);
    expect(history.losses).toBe(1);
    expect(history.rankedOnly).toBe(1);
  });

  it("胜率按**有胜负的场次**算，不把排名制场次算进分母", () => {
    const history = summarizeStudentHistory([
      entry({ outcome: "win" }),
      entry({ outcome: "loss" }),
      entry({ formatCode: "BP", outcome: null, rank: 2, speakerTotal: 75, speakerMax: 85 }),
    ]);
    // 1 胜 1 负 → 50%，而不是 1/3
    expect(history.winRate).toBe(50);
  });

  it("全是排名制场次时胜率是 null（而不是 0%）", () => {
    const history = summarizeStudentHistory([
      entry({ formatCode: "BP", outcome: null, rank: 1 }),
      entry({ formatCode: "BP", outcome: null, rank: 3 }),
    ]);
    expect(history.winRate).toBeNull();
  });
});

describe("个人总分", () => {
  it("平均值与最高分", () => {
    const history = summarizeStudentHistory([
      entry({ speakerTotal: 70 }),
      entry({ speakerTotal: 75 }),
      entry({ speakerTotal: 65 }),
    ]);
    expect(history.averageTotal).toBe(70);
    expect(history.highestTotal).toBe(75);
  });

  it("缺分的场次**不参与**平均（而不是当成 0）", () => {
    const history = summarizeStudentHistory([
      entry({ speakerTotal: 70 }),
      entry({ speakerTotal: null }),
      entry({ speakerTotal: 80 }),
    ]);
    // 若把 null 当 0，平均会是 50
    expect(history.averageTotal).toBe(75);
  });

  it("半分被正确平均并收敛到一位小数", () => {
    const history = summarizeStudentHistory([
      entry({ speakerTotal: 70.5 }),
      entry({ speakerTotal: 71.5 }),
      entry({ speakerTotal: 71 }),
    ]);
    // (70.5 + 71.5 + 71) / 3 = 71.0 —— 不是 70.99999...
    expect(history.averageTotal).toBe(71);
  });
});

describe("按赛制分组", () => {
  it("每个赛制单独统计，不混在一起", () => {
    const history = summarizeStudentHistory([
      entry({ formatCode: "WSDC", speakerTotal: 70 }),
      entry({ formatCode: "PF", speakerTotal: 25, speakerMax: 30 }),
      entry({ formatCode: "PF", speakerTotal: 27, speakerMax: 30 }),
    ]);
    const pf = history.byFormat.find((group) => group.formatCode === "PF");
    const wsdc = history.byFormat.find((group) => group.formatCode === "WSDC");
    expect(pf).toMatchObject({ debates: 2, averageTotal: 26 });
    expect(wsdc).toMatchObject({ debates: 1, averageTotal: 70 });
  });
});

/**
 * ⚠️ 逐项平均**必须按赛制分开**。
 *
 * WSDC 的"表达"满分 40，1v1 的"论证"满分 10；
 * 而且同一个键在不同赛制里含义也不同。跨赛制平均出来的数字没有含义。
 */
describe("逐项平均按赛制分开", () => {
  it("不同赛制的逐项平均是分开的两组", () => {
    const history = summarizeStudentHistory([
      entry({ formatCode: "WSDC" }),
      entry({ formatCode: "WSDC" }),
      entry({
        formatCode: "PF",
        speakerTotal: 26,
        speakerMax: 30,
        categoryScores: { argumentation: 9, rebuttal: 7 },
        categoryLabels: {
          argumentation: { label: "论证与证据", max: 10 },
          rebuttal: { label: "反驳与比较", max: 8 },
        },
      }),
      entry({
        formatCode: "PF",
        speakerTotal: 27,
        speakerMax: 30,
        categoryScores: { argumentation: 9, rebuttal: 8 },
        categoryLabels: {
          argumentation: { label: "论证与证据", max: 10 },
          rebuttal: { label: "反驳与比较", max: 8 },
        },
      }),
    ]);

    const pf = history.categoryAverages.find((group) => group.formatCode === "PF");
    const wsdc = history.categoryAverages.find((group) => group.formatCode === "WSDC");

    expect(pf?.items.map((item) => item.key).sort()).toEqual(["argumentation", "rebuttal"]);
    expect(wsdc?.items.map((item) => item.key).sort()).toEqual(["content", "strategy", "style"]);
    // WSDC 的平均里**不应**出现 PF 的键
    expect(wsdc?.items.map((item) => item.key)).not.toContain("argumentation");
  });

  it("只出现过一次的项**不给平均值**（一场的分数不叫平均）", () => {
    const history = summarizeStudentHistory([
      entry({ categoryScores: { style: 28 } }),
      entry({ categoryScores: { style: 30, content: 25 } }),
    ]);
    const wsdc = history.categoryAverages.find((group) => group.formatCode === "WSDC");
    expect(wsdc?.items.map((item) => item.key)).toEqual(["style"]);
  });
});

/**
 * 趋势需要足够的样本。
 * 规范没有给这个数字，`MIN_DEBATES_FOR_TREND` 是我的选择 ——
 * 少于 4 场时"最近两场 vs 前两场"基本是噪声，给出结论会**误导学生**。
 */
describe("趋势：样本不足时**不给结论**", () => {
  it(`少于 ${MIN_DEBATES_FOR_TREND} 场时是 unknown`, () => {
    const history = summarizeStudentHistory([
      entry({ scheduledStart: "2026-05-01T10:00:00.000Z", speakerTotal: 60 }),
      entry({ scheduledStart: "2026-05-02T10:00:00.000Z", speakerTotal: 80 }),
      entry({ scheduledStart: "2026-05-03T10:00:00.000Z", speakerTotal: 90 }),
    ]);
    expect(history.recentTrend.direction).toBe("unknown");
    expect(history.recentTrend.delta).toBeNull();
  });

  it("足够样本时可以算出进步", () => {
    const history = summarizeStudentHistory([
      entry({ scheduledStart: "2026-05-01T10:00:00.000Z", speakerTotal: 65 }),
      entry({ scheduledStart: "2026-05-02T10:00:00.000Z", speakerTotal: 66 }),
      entry({ scheduledStart: "2026-05-03T10:00:00.000Z", speakerTotal: 72 }),
      entry({ scheduledStart: "2026-05-04T10:00:00.000Z", speakerTotal: 74 }),
    ]);
    expect(history.recentTrend.direction).toBe("up");
    expect(history.recentTrend.delta).toBe(7.5); // (72+74)/2 - (65+66)/2
  });

  it("足够样本时可以算出退步", () => {
    const history = summarizeStudentHistory([
      entry({ scheduledStart: "2026-05-01T10:00:00.000Z", speakerTotal: 78 }),
      entry({ scheduledStart: "2026-05-02T10:00:00.000Z", speakerTotal: 77 }),
      entry({ scheduledStart: "2026-05-03T10:00:00.000Z", speakerTotal: 70 }),
      entry({ scheduledStart: "2026-05-04T10:00:00.000Z", speakerTotal: 69 }),
    ]);
    expect(history.recentTrend.direction).toBe("down");
  });

  it("变化不到 0.5 分时算 flat（半分制的赛制里那不值得叫变化）", () => {
    const history = summarizeStudentHistory([
      entry({ scheduledStart: "2026-05-01T10:00:00.000Z", speakerTotal: 70 }),
      entry({ scheduledStart: "2026-05-02T10:00:00.000Z", speakerTotal: 70 }),
      entry({ scheduledStart: "2026-05-03T10:00:00.000Z", speakerTotal: 70.5 }),
      entry({ scheduledStart: "2026-05-04T10:00:00.000Z", speakerTotal: 70 }),
    ]);
    expect(history.recentTrend.direction).toBe("flat");
  });

  it("顺序打乱也能正确算出趋势（内部按时间排序）", () => {
    const entries = [
      entry({ scheduledStart: "2026-05-03T10:00:00.000Z", speakerTotal: 72 }),
      entry({ scheduledStart: "2026-05-01T10:00:00.000Z", speakerTotal: 65 }),
      entry({ scheduledStart: "2026-05-04T10:00:00.000Z", speakerTotal: 74 }),
      entry({ scheduledStart: "2026-05-02T10:00:00.000Z", speakerTotal: 66 }),
    ];
    expect(summarizeStudentHistory(entries).recentTrend.direction).toBe("up");
  });
});

/**
 * ⚠️ 规范要求："Do not immediately create public rankings."
 *
 * 这一节把"算不出排名"固定下来：产出里**没有任何**跨学生的字段。
 */
describe("⚠️ 不做公开排名（规范明确要求）", () => {
  it("产出的字段里没有名次、百分位或与他人的比较", () => {
    const history = summarizeStudentHistory([entry(), entry(), entry(), entry()]);
    const keys = Object.keys(history);
    for (const forbidden of [
      "rank",
      "ranking",
      "percentile",
      "position",
      "leaderboard",
      "cohort",
    ]) {
      expect(keys, `产出不应包含 ${forbidden}`).not.toContain(forbidden);
    }
    // byFormat 里也不能有名次
    for (const group of history.byFormat) {
      expect(Object.keys(group)).not.toContain("rank");
    }
  });

  it("rank 字段只是**记录学生在那一场自己的名次**，不参与任何汇总", () => {
    const withRank = summarizeStudentHistory([
      entry({ formatCode: "BP", outcome: null, rank: 1 }),
      entry({ formatCode: "BP", outcome: null, rank: 4 }),
    ]);
    const withoutRank = summarizeStudentHistory([
      entry({ formatCode: "BP", outcome: null, rank: null }),
      entry({ formatCode: "BP", outcome: null, rank: null }),
    ]);
    // 除了 rank 输入不同，两份汇总结果应当完全一致 —— 证明 rank 不参与统计
    expect({ ...withRank, recentTrend: null }).toEqual({ ...withoutRank, recentTrend: null });
  });
});

describe("确定性", () => {
  it("相同输入重复汇总结果一致", () => {
    const entries = [entry(), entry({ speakerTotal: 75 }), entry({ outcome: "loss" })];
    const runs = Array.from({ length: 5 }, () => JSON.stringify(summarizeStudentHistory(entries)));
    expect(new Set(runs).size).toBe(1);
  });

  it("不修改入参", () => {
    const entries = [entry(), entry()];
    const snapshot = JSON.stringify(entries);
    summarizeStudentHistory(entries);
    expect(JSON.stringify(entries)).toBe(snapshot);
  });
});
