// @vitest-environment node
import { describe, expect, it } from "vitest";

import {
  FORMAT_SIDE_POSITIONS,
  MATCH_COST_WEIGHTS,
  ZERO_MATCH_COST,
  britishParliamentaryRatingSpread,
  computeMatchCost,
  explainMatchCost,
  isValidSidePosition,
  matchCostTerms,
  orderBySeed,
  seededHash,
  sideImbalance,
  tieBreakSeed,
} from "@/lib/domain/match-cost";
import {
  ADDITIONAL_JUDGE_CONFLICT_RULES,
  JUDGE_COST_WEIGHTS,
  ZERO_JUDGE_COST,
  checkJudgeEligibility,
  computeJudgeCost,
  explainJudgeCost,
  judgeCostTerms,
} from "@/lib/domain/judge-cost";

/**
 * 比赛成本、正反方分配与裁判成本（规范第 10.4、10.5、11 节）。
 *
 * 测试策略沿用 P4-2：**每个权重单独验证**（把该项加 1，断言总成本恰好增加该权重），
 * 因为只测"总数等于某个值"时，两个权重同时写错但互相抵消仍然会通过。
 */

describe("比赛成本：权重与规范一致", () => {
  it("规范给出的四个权重与实现完全一致", () => {
    expect(MATCH_COST_WEIGHTS).toEqual({
      averageRatingSpread: 12,
      repeatOpponent: 8,
      repeatedJudgeExposure: 3,
      sideImbalance: 2,
    });
  });

  const cases: { name: string; patch: Partial<typeof ZERO_MATCH_COST>; delta: number }[] = [
    { name: "评分跨度 +1", patch: { averageRatingSpread: 1 }, delta: 12 },
    { name: "多 1 次重复对手", patch: { repeatOpponentCount: 1 }, delta: 8 },
    { name: "重复裁判暴露 +1", patch: { repeatedJudgeExposureEstimate: 1 }, delta: 3 },
    { name: "正反方不平衡 +1", patch: { sideImbalanceAfterAssignment: 1 }, delta: 2 },
  ];

  for (const testCase of cases) {
    it(testCase.name, () => {
      const baseline = computeMatchCost(ZERO_MATCH_COST);
      const changed = computeMatchCost({ ...ZERO_MATCH_COST, ...testCase.patch });
      expect(changed - baseline).toBe(testCase.delta);
    });
  }

  it("全零时成本为 0", () => {
    expect(computeMatchCost(ZERO_MATCH_COST)).toBe(0);
  });

  it("多项叠加等于逐项相加", () => {
    expect(
      computeMatchCost({
        averageRatingSpread: 2,
        repeatOpponentCount: 1,
        repeatedJudgeExposureEstimate: 3,
        sideImbalanceAfterAssignment: 4,
      }),
    ).toBe(24 + 8 + 9 + 8);
  });

  it("可解释：逐项之和等于总成本", () => {
    const components = {
      averageRatingSpread: 1.5,
      repeatOpponentCount: 2,
      repeatedJudgeExposureEstimate: 1,
      sideImbalanceAfterAssignment: 3,
    };
    const explanation = explainMatchCost(components);
    const sum = explanation.terms.reduce((total, term) => total + term.contribution, 0);
    expect(explanation.total).toBe(sum);
    expect(sum).toBe(computeMatchCost(components));
  });

  it("可解释：变化大的项被标为主导项", () => {
    // 重复对手 8×4=32 明显大于评分跨度 12×1=12
    const explanation = explainMatchCost({
      ...ZERO_MATCH_COST,
      averageRatingSpread: 1,
      repeatOpponentCount: 4,
    });
    expect(explanation.dominant?.key).toBe("repeatOpponent");
  });
});

/**
 * 规范对 BP 的明文限制：
 * "compare both overall room spread and adjacent team strength;
 *  do not reduce four-team placement to a binary winner model."
 */
describe("BP：必须同时看总体跨度与相邻强度，不能简化为二元胜负", () => {
  it("总体跨度相同但分布不同时，分数必须不同", () => {
    // 两强两弱、中间断档
    const twoStrongTwoWeak = britishParliamentaryRatingSpread([3, 3, 9, 9]);
    // 四队均匀过渡（总体跨度同样是 6）
    const evenlySpread = britishParliamentaryRatingSpread([3, 6, 6, 9]);

    expect(twoStrongTwoWeak).not.toBe(evenlySpread);
    // 断档大的更差 → 数值更大
    expect(twoStrongTwoWeak).toBeGreaterThan(evenlySpread);
  });

  it("「两强两弱」的数值确实是 6.0（总体跨度 6 + 最大相邻断档 6）÷2", () => {
    expect(britishParliamentaryRatingSpread([3, 3, 9, 9])).toBe(6);
  });

  it("「均匀过渡」的数值是 4.5（总体跨度 6 + 最大相邻断档 3）÷2", () => {
    expect(britishParliamentaryRatingSpread([3, 6, 6, 9])).toBe(4.5);
  });

  it("四队完全同分时为 0", () => {
    expect(britishParliamentaryRatingSpread([5, 5, 5, 5])).toBe(0);
  });

  it("与传入顺序无关（内部会排序）", () => {
    expect(britishParliamentaryRatingSpread([9, 3, 9, 3])).toBe(
      britishParliamentaryRatingSpread([3, 3, 9, 9]),
    );
  });

  it("少于两支队伍时为 0", () => {
    expect(britishParliamentaryRatingSpread([5])).toBe(0);
    expect(britishParliamentaryRatingSpread([])).toBe(0);
  });
});

describe("正反方水平衡", () => {
  it("两侧总分相等时为 0", () => {
    expect(sideImbalance([5, 5], [4, 6])).toBe(0);
  });

  it("两侧总分差即为不平衡程度", () => {
    expect(sideImbalance([9, 9], [1, 1])).toBe(16);
  });

  it("与两侧传入顺序无关", () => {
    expect(sideImbalance([9, 9], [1, 1])).toBe(sideImbalance([1, 1], [9, 9]));
  });
});

describe("正反方位置按赛制区分（规范 10.5）", () => {
  it("五种赛制的位置集合与规范一致", () => {
    expect(FORMAT_SIDE_POSITIONS.PF).toEqual(["PROP", "OPP"]);
    expect(FORMAT_SIDE_POSITIONS.JWSD).toEqual(["PROP", "OPP"]);
    expect(FORMAT_SIDE_POSITIONS.WSDC).toEqual(["PROP", "OPP"]);
    expect(FORMAT_SIDE_POSITIONS.ONE_V_ONE).toEqual(["PROP", "OPP"]);
    expect(FORMAT_SIDE_POSITIONS.BP).toEqual(["OG", "OO", "CG", "CO"]);
  });

  it("PF 不接受 BP 的位置，BP 不接受 PF 的位置", () => {
    expect(isValidSidePosition("PF", "OG")).toBe(false);
    expect(isValidSidePosition("BP", "PROP")).toBe(false);
  });

  it("各自的合法位置被接受", () => {
    expect(isValidSidePosition("PF", "PROP")).toBe(true);
    expect(isValidSidePosition("BP", "CG")).toBe(true);
  });

  it("未知赛制一律不接受（默认拒绝）", () => {
    expect(isValidSidePosition("NOPE", "PROP")).toBe(false);
  });
});

/**
 * 规范 10.5 的确定性要求：
 * "Break equal scores deterministically with a seeded hash based on event ID and
 *  team ID so reruns with unchanged inputs give the same result."
 */
describe("种子哈希与并列打破（规范 10.5）", () => {
  it("同一输入永远得到同一个哈希", () => {
    const seed = tieBreakSeed("event-1", "team-1");
    const runs = Array.from({ length: 20 }, () => seededHash(seed));
    expect(new Set(runs).size).toBe(1);
  });

  it("不同 id 得到不同哈希（至少这几个样例不同）", () => {
    const hashes = ["t1", "t2", "t3", "t4", "t5"].map((id) => seededHash(tieBreakSeed("e", id)));
    expect(new Set(hashes).size).toBe(hashes.length);
  });

  it("活动 id 不同时哈希不同", () => {
    expect(seededHash(tieBreakSeed("e1", "t1"))).not.toBe(seededHash(tieBreakSeed("e2", "t1")));
  });

  it("orderBySeed 与传入顺序无关", () => {
    const ids = ["t1", "t2", "t3", "t4"];
    expect(orderBySeed("e", [...ids].reverse())).toEqual(orderBySeed("e", ids));
  });

  it("orderBySeed 重复调用结果一致（重跑得到相同结果）", () => {
    const ids = ["t1", "t2", "t3", "t4", "t5"];
    expect(orderBySeed("e", ids)).toEqual(orderBySeed("e", ids));
  });

  it("orderBySeed 不丢人也不多人", () => {
    const ids = ["t1", "t2", "t3"];
    expect([...orderBySeed("e", ids)].sort()).toEqual([...ids].sort());
  });

  it("不修改入参", () => {
    const ids = ["t1", "t2", "t3"];
    const snapshot = [...ids];
    orderBySeed("e", ids);
    expect(ids).toEqual(snapshot);
  });
});

describe("裁判成本：权重与规范一致", () => {
  it("规范给出的三个权重与实现完全一致", () => {
    expect(JUDGE_COST_WEIGHTS).toEqual({
      totalTimesJudgedAnyStudent: 10,
      recentTimesJudgedAnyStudent: 6,
      workloadForEvent: 3,
    });
  });

  const cases: { name: string; patch: Partial<typeof ZERO_JUDGE_COST>; delta: number }[] = [
    { name: "历史执裁本场学生 +1", patch: { totalTimesJudgedAnyStudentInMatch: 1 }, delta: 10 },
    { name: "近期执裁本场学生 +1", patch: { recentTimesJudgedAnyStudentInMatch: 1 }, delta: 6 },
    { name: "本活动工作量 +1", patch: { workloadCountForEvent: 1 }, delta: 3 },
  ];

  for (const testCase of cases) {
    it(testCase.name, () => {
      const baseline = computeJudgeCost(ZERO_JUDGE_COST);
      const changed = computeJudgeCost({ ...ZERO_JUDGE_COST, ...testCase.patch });
      expect(changed - baseline).toBe(testCase.delta);
    });
  }

  it("全零时为 0（理想情况：没执裁过这批学生、也没工作量）", () => {
    expect(computeJudgeCost(ZERO_JUDGE_COST)).toBe(0);
  });

  it("重复执裁比工作量更严重（权重直接体现优先级）", () => {
    const repeated = computeJudgeCost({ ...ZERO_JUDGE_COST, totalTimesJudgedAnyStudentInMatch: 1 });
    const busy = computeJudgeCost({ ...ZERO_JUDGE_COST, workloadCountForEvent: 3 });
    expect(repeated).toBeGreaterThan(busy);
  });

  it("可解释：逐项之和等于总成本", () => {
    const components = {
      totalTimesJudgedAnyStudentInMatch: 2,
      recentTimesJudgedAnyStudentInMatch: 1,
      workloadCountForEvent: 4,
    };
    const explanation = explainJudgeCost(components);
    expect(explanation.total).toBe(computeJudgeCost(components));
    expect(explanation.terms.reduce((total, term) => total + term.contribution, 0)).toBe(
      explanation.total,
    );
  });

  it("judgeCostTerms 暴露原始值与权重，供推荐界面显示", () => {
    const terms = judgeCostTerms({ ...ZERO_JUDGE_COST, workloadCountForEvent: 2 });
    const workload = terms.find((term) => term.key === "workloadForEvent");
    expect(workload?.weight).toBe(3);
    expect(workload?.rawValue).toBe(2);
    expect(workload?.contribution).toBe(6);
  });
});

/**
 * 规范第 11 节的五条**硬性资格条件**（不是成本项，不满足就直接排除）。
 */
describe("裁判资格：五条硬性条件", () => {
  const eligibleFacts = {
    approved: true,
    availableForEvent: true,
    qualifiedForFormat: true,
    liveAssignmentRequiresCheckIn: false,
    checkedIn: false,
    hasOverlappingAssignment: false,
  };

  it("全部满足时合格", () => {
    const result = checkJudgeEligibility(eligibleFacts);
    expect(result.eligible).toBe(true);
    expect(result.reasons).toEqual([]);
  });

  const rejections: { name: string; patch: Partial<typeof eligibleFacts>; keyword: string }[] = [
    { name: "未审批", patch: { approved: false }, keyword: "审批" },
    { name: "活动上不可用", patch: { availableForEvent: false }, keyword: "可用" },
    { name: "没有该赛制资格", patch: { qualifiedForFormat: false }, keyword: "资格" },
    { name: "时间冲突", patch: { hasOverlappingAssignment: true }, keyword: "冲突" },
  ];

  for (const testCase of rejections) {
    it(`${testCase.name} → 不合格，且原因可直接显示`, () => {
      const result = checkJudgeEligibility({ ...eligibleFacts, ...testCase.patch });
      expect(result.eligible).toBe(false);
      expect(result.reasons.join("")).toContain(testCase.keyword);
    });
  }

  it("现场指派要求签到时，未签到 → 不合格", () => {
    const result = checkJudgeEligibility({
      ...eligibleFacts,
      liveAssignmentRequiresCheckIn: true,
      checkedIn: false,
    });
    expect(result.eligible).toBe(false);
    expect(result.reasons.join("")).toContain("签到");
  });

  it("**不**要求签到时，未签到不影响资格（规范：只有现场指派时才要求）", () => {
    expect(
      checkJudgeEligibility({
        ...eligibleFacts,
        liveAssignmentRequiresCheckIn: false,
        checkedIn: false,
      }).eligible,
    ).toBe(true);
  });

  it("签到且要求签到时合格", () => {
    expect(
      checkJudgeEligibility({
        ...eligibleFacts,
        liveAssignmentRequiresCheckIn: true,
        checkedIn: true,
      }).eligible,
    ).toBe(true);
  });

  it("多个问题同时存在时全部列出，而不是只报第一个", () => {
    const result = checkJudgeEligibility({
      approved: false,
      availableForEvent: false,
      qualifiedForFormat: false,
      liveAssignmentRequiresCheckIn: true,
      checkedIn: false,
      hasOverlappingAssignment: true,
    });
    expect(result.reasons).toHaveLength(5);
  });
});

/**
 * 规范第 11 节的明文限制：
 * "Do not invent school/coach conflicts without product-owner confirmation."
 */
describe("回避规则：只允许规范限定的那一条", () => {
  it("额外的回避规则列表**必须是空的**（规范限定 V1 只有重复执裁）", () => {
    expect(ADDITIONAL_JUDGE_CONFLICT_RULES).toHaveLength(0);
  });

  it("重复执裁由前两个权重表达，不需要额外规则", () => {
    const cost = computeJudgeCost({ ...ZERO_JUDGE_COST, totalTimesJudgedAnyStudentInMatch: 1 });
    expect(cost).toBe(10);
  });
});

describe("确定性与纯函数性质", () => {
  it("相同输入重复计算结果完全一致", () => {
    const components = {
      averageRatingSpread: 3.5,
      repeatOpponentCount: 2,
      repeatedJudgeExposureEstimate: 1,
      sideImbalanceAfterAssignment: 4,
    };
    const runs = Array.from({ length: 20 }, () => computeMatchCost(components));
    expect(new Set(runs).size).toBe(1);
  });

  it("不修改入参", () => {
    const components = { ...ZERO_MATCH_COST, averageRatingSpread: 2 };
    computeMatchCost(components);
    expect(components.averageRatingSpread).toBe(2);
  });

  it("matchCostTerms 的 key 集合与权重表一致（防止漏项）", () => {
    const keys = matchCostTerms(ZERO_MATCH_COST).map((term) => term.key);
    expect(new Set(keys)).toEqual(new Set(Object.keys(MATCH_COST_WEIGHTS)));
  });

  it("judgeCostTerms 的 key 集合与权重表一致（防止漏项）", () => {
    const keys = judgeCostTerms(ZERO_JUDGE_COST).map((term) => term.key);
    expect(new Set(keys)).toEqual(new Set(Object.keys(JUDGE_COST_WEIGHTS)));
  });
});
