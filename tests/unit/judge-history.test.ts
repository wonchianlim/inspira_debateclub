// @vitest-environment node
import { describe, expect, it } from "vitest";

import { type JudgeHistoryEntry, summarizeJudgeHistory } from "@/lib/domain/judge-history";

/**
 * 裁判历史（Phase 8 / P8-4）。
 *
 * ⚠️ 规范只要求"裁判自己的历史"，**完全没有**要求裁判之间的比较。
 * 因此这里有一节断言产出里没有任何跨裁判的字段 ——
 * 裁判的分数松紧一旦公开，会变成**选裁判**的依据，
 * 而规范第 10 节要的是**校准**（尺度一致），不是挑选。
 */

function entry(overrides: Partial<JudgeHistoryEntry> = {}): JudgeHistoryEntry {
  return {
    formatCode: "WSDC",
    submittedAt: "2026-05-01T12:00:00.000Z",
    status: "submitted",
    averageScoreGiven: 70,
    wasReopened: false,
    reasonLength: 200,
    ...overrides,
  };
}

describe("空数据不崩", () => {
  const empty = summarizeJudgeHistory([]);

  it("全部为 0 / null", () => {
    expect(empty.assigned).toBe(0);
    expect(empty.completed).toBe(0);
    expect(empty.completionRate).toBeNull();
    expect(empty.averageScoreGiven).toBeNull();
    expect(empty.byFormat).toEqual([]);
  });
});

describe("完成情况", () => {
  it("区分已交回与未交回", () => {
    const history = summarizeJudgeHistory([
      entry({ status: "submitted" }),
      entry({ status: "published" }),
      entry({ status: "draft" }),
      entry({ status: "reopened" }),
    ]);
    expect(history.assigned).toBe(4);
    expect(history.completed).toBe(2);
    expect(history.outstanding).toBe(2);
    expect(history.completionRate).toBe(50);
  });

  /**
   * `reopened` **不算**完成 —— 与看板口径一致。
   * 管理员要求更正而更正还没到，把它算成完成会让完成率虚高。
   */
  it("已重开**不算**完成", () => {
    const history = summarizeJudgeHistory([
      entry({ status: "reopened" }),
      entry({ status: "submitted" }),
    ]);
    expect(history.completed).toBe(1);
    expect(history.completionRate).toBe(50);
  });

  it("resubmitted 算完成", () => {
    expect(summarizeJudgeHistory([entry({ status: "resubmitted" })]).completed).toBe(1);
  });
});

describe("按赛制统计", () => {
  it("按完成场次从多到少排序", () => {
    const history = summarizeJudgeHistory([
      entry({ formatCode: "WSDC" }),
      entry({ formatCode: "WSDC" }),
      entry({ formatCode: "PF" }),
      entry({ formatCode: "BP" }),
      entry({ formatCode: "BP" }),
      entry({ formatCode: "BP" }),
    ]);
    expect(history.byFormat.map((group) => group.formatCode)).toEqual(["BP", "WSDC", "PF"]);
  });

  it("只统计**已交回**的场次，未交回的不计入赛制分布", () => {
    const history = summarizeJudgeHistory([
      entry({ formatCode: "PF", status: "draft" }),
      entry({ formatCode: "WSDC", status: "submitted" }),
    ]);
    expect(history.byFormat).toEqual([{ formatCode: "WSDC", completed: 1 }]);
  });
});

describe("给分与理由长度", () => {
  it("平均给分只算已交回的场次", () => {
    const history = summarizeJudgeHistory([
      entry({ averageScoreGiven: 70, status: "submitted" }),
      entry({ averageScoreGiven: 80, status: "submitted" }),
      // 未交回的草稿不该影响平均
      entry({ averageScoreGiven: 20, status: "draft" }),
    ]);
    expect(history.averageScoreGiven).toBe(75);
  });

  it("没有分数的场次不参与平均（而不是当成 0）", () => {
    const history = summarizeJudgeHistory([
      entry({ averageScoreGiven: 70 }),
      entry({ averageScoreGiven: null }),
      entry({ averageScoreGiven: 80 }),
    ]);
    expect(history.averageScoreGiven).toBe(75);
  });

  it("平均理由长度按字取整", () => {
    const history = summarizeJudgeHistory([
      entry({ reasonLength: 100 }),
      entry({ reasonLength: 151 }),
    ]);
    expect(history.averageReasonLength).toBe(126); // 125.5 → 126
  });

  it("重开次数只陈述、不解读", () => {
    const history = summarizeJudgeHistory([
      entry({ wasReopened: true }),
      entry({ wasReopened: false }),
      entry({ wasReopened: true, status: "reopened" }),
    ]);
    expect(history.reopenedCount).toBe(2);
  });
});

describe("⚠️ 没有跨裁判的字段（规范只要求自己的历史）", () => {
  it("产出里没有排名、百分位或与他人的比较", () => {
    const history = summarizeJudgeHistory([entry(), entry(), entry()]);
    for (const forbidden of [
      "rank",
      "ranking",
      "percentile",
      "peerAverage",
      "cohort",
      "comparison",
      "band",
    ]) {
      expect(Object.keys(history), `产出不应包含 ${forbidden}`).not.toContain(forbidden);
    }
  });

  it("RFD 平均长度是与规范门槛比较，不是与其他裁判比较", () => {
    const history = summarizeJudgeHistory([entry({ reasonLength: 120 })]);
    // 只是一个数字，没有"你比别人长/短"的字段
    expect(typeof history.averageReasonLength).toBe("number");
    expect(Object.keys(history)).not.toContain("reasonLengthVsPeers");
  });
});

describe("确定性", () => {
  it("相同输入重复汇总结果一致", () => {
    const entries = [entry(), entry({ formatCode: "PF" }), entry({ status: "draft" })];
    const runs = Array.from({ length: 5 }, () => JSON.stringify(summarizeJudgeHistory(entries)));
    expect(new Set(runs).size).toBe(1);
  });

  it("不修改入参", () => {
    const entries = [entry(), entry()];
    const snapshot = JSON.stringify(entries);
    summarizeJudgeHistory(entries);
    expect(JSON.stringify(entries)).toBe(snapshot);
  });
});
