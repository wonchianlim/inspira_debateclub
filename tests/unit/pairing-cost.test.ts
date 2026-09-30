// @vitest-environment node
import { describe, expect, it } from "vitest";

import {
  IDEAL_TEAM_COST_COMPONENTS,
  PAIRING_ALGORITHM_VERSION,
  TEAM_COST_WEIGHTS,
  type TeamCostComponents,
  computeTeamCost,
  explainTeamCost,
  ratingRange,
  ratingStandardDeviation,
  teamCostTerms,
} from "@/lib/domain/pairing-cost";

/**
 * 配对成本函数。
 *
 * 测试策略：**每一个权重都单独验证**。
 * 只测"总成本等于某个数"是不够的 —— 那样两个权重同时写错但互相抵消时测试仍然通过。
 * 因此每一项都有一条测试把该项加 1，断言总成本**恰好**增加该权重。
 */

const ZERO: TeamCostComponents = {
  eligibilityViolationCount: 0,
  unavailableStudentCount: 0,
  incompleteTeam: false,
  ratingRange: 0,
  ratingStandardDeviation: 0,
  repeatedTeammatePairCount: 0,
  acceptedPartnerPairCount: 0,
};

describe("权重与规范一致（逐项核对）", () => {
  it("规范给定的七个权重与实现完全一致", () => {
    // 这张表直接对应规范第 10.3 节的公式，改动它就是改算法
    expect(TEAM_COST_WEIGHTS).toEqual({
      eligibilityViolation: 1000,
      unavailableStudent: 500,
      incompleteTeam: 100,
      ratingRange: 10,
      ratingStandardDeviation: 4,
      repeatedTeammate: 2,
      acceptedPartnerBonus: -50,
    });
  });

  it("算法版本号存在（规范要求提案里持久化它）", () => {
    expect(PAIRING_ALGORITHM_VERSION).toMatch(/^\d+\.\d+\.\d+$/);
  });
});

describe("每一个权重都按给定倍数生效", () => {
  const cases: { name: string; patch: Partial<TeamCostComponents>; expectedDelta: number }[] = [
    { name: "多 1 个不合格成员", patch: { eligibilityViolationCount: 1 }, expectedDelta: 1000 },
    { name: "多 1 个不可用成员", patch: { unavailableStudentCount: 1 }, expectedDelta: 500 },
    { name: "队伍不完整", patch: { incompleteTeam: true }, expectedDelta: 100 },
    { name: "评分极差 +1", patch: { ratingRange: 1 }, expectedDelta: 10 },
    { name: "标准差 +1", patch: { ratingStandardDeviation: 1 }, expectedDelta: 4 },
    { name: "多 1 对重复队友", patch: { repeatedTeammatePairCount: 1 }, expectedDelta: 2 },
    { name: "保留 1 对已接受搭档", patch: { acceptedPartnerPairCount: 1 }, expectedDelta: -50 },
  ];

  for (const testCase of cases) {
    it(testCase.name, () => {
      const baseline = computeTeamCost(ZERO);
      const withChange = computeTeamCost({ ...ZERO, ...testCase.patch });
      expect(withChange - baseline).toBe(testCase.expectedDelta);
    });
  }

  it("权重翻倍时贡献也恰好翻倍（证明是乘法而不是别的映射）", () => {
    const one = computeTeamCost({ ...ZERO, ratingRange: 1 });
    const two = computeTeamCost({ ...ZERO, ratingRange: 2 });
    const ten = computeTeamCost({ ...ZERO, ratingRange: 10 });
    expect(two - one).toBe(one - computeTeamCost(ZERO));
    expect(ten - one).toBe(9 * (one - computeTeamCost(ZERO)));
  });
});

describe("各项组合", () => {
  it("全零时成本为 0", () => {
    expect(computeTeamCost(ZERO)).toBe(0);
  });

  it("多项叠加等于逐项相加", () => {
    const components: TeamCostComponents = {
      eligibilityViolationCount: 1,
      unavailableStudentCount: 2,
      incompleteTeam: true,
      ratingRange: 3,
      ratingStandardDeviation: 2,
      repeatedTeammatePairCount: 4,
      acceptedPartnerPairCount: 1,
    };
    // 1000 + 1000 + 100 + 30 + 8 + 8 - 50
    expect(computeTeamCost(components)).toBe(1000 + 1000 + 100 + 30 + 8 + 8 - 50);
  });

  it("理想队伍的成本为 −50（保留一对已接受搭档）", () => {
    expect(computeTeamCost(IDEAL_TEAM_COST_COMPONENTS)).toBe(-50);
  });

  it("成本可以为负 —— 减分项确实在降低总成本", () => {
    const withoutBonus = computeTeamCost({
      ...IDEAL_TEAM_COST_COMPONENTS,
      acceptedPartnerPairCount: 0,
    });
    const withBonus = computeTeamCost(IDEAL_TEAM_COST_COMPONENTS);
    expect(withBonus).toBeLessThan(withoutBonus);
  });
});

describe("评分统计", () => {
  it("极差 = 最大 − 最小", () => {
    expect(ratingRange([5, 9, 7])).toBe(4);
    expect(ratingRange([7, 7, 7])).toBe(0);
  });

  it("空数组或单人时极差为 0", () => {
    expect(ratingRange([])).toBe(0);
    expect(ratingRange([8])).toBe(0);
  });

  it("总体标准差（分母是人数）", () => {
    // [2,4,4,4,5,5,7,9] 的总体标准差是 2
    expect(ratingStandardDeviation([2, 4, 4, 4, 5, 5, 7, 9])).toBeCloseTo(2, 10);
  });

  it("全同分时标准差为 0", () => {
    expect(ratingStandardDeviation([6, 6, 6])).toBe(0);
  });

  it("空数组标准差为 0（不返回 NaN）", () => {
    expect(ratingStandardDeviation([])).toBe(0);
  });

  it("两人相差 2 分时标准差为 1", () => {
    expect(ratingStandardDeviation([6, 8])).toBeCloseTo(1, 10);
  });
});

describe("可解释性（规范要求解释取舍）", () => {
  it("逐项返回权重、原始值与贡献", () => {
    const terms = teamCostTerms({
      ...ZERO,
      eligibilityViolationCount: 2,
      ratingRange: 3,
    });

    const eligibility = terms.find((term) => term.key === "eligibilityViolation");
    expect(eligibility?.weight).toBe(1000);
    expect(eligibility?.rawValue).toBe(2);
    expect(eligibility?.contribution).toBe(2000);

    const range = terms.find((term) => term.key === "ratingRange");
    expect(range?.contribution).toBe(30);
  });

  it("贡献之和等于总成本", () => {
    const components: TeamCostComponents = {
      eligibilityViolationCount: 1,
      unavailableStudentCount: 1,
      incompleteTeam: true,
      ratingRange: 5,
      ratingStandardDeviation: 3,
      repeatedTeammatePairCount: 2,
      acceptedPartnerPairCount: 1,
    };
    const explanation = explainTeamCost(components);
    const sum = explanation.terms.reduce((total, term) => total + term.contribution, 0);
    expect(explanation.total).toBe(sum);
    expect(explanation.total).toBe(computeTeamCost(components));
  });

  it("指出成本最高的那一项（最能解释为什么贵）", () => {
    // 两个不合格（2000）明显比极差 5（50）更贵
    const explanation = explainTeamCost({
      ...ZERO,
      eligibilityViolationCount: 2,
      ratingRange: 5,
    });
    expect(explanation.dominant?.key).toBe("eligibilityViolation");
  });

  it("全零时没有主导项", () => {
    expect(explainTeamCost(ZERO).dominant).toBeNull();
  });

  it("减分项不会被当作主导项（它让成本变低，不是变高的原因）", () => {
    const explanation = explainTeamCost({
      ...ZERO,
      acceptedPartnerPairCount: 1,
      ratingRange: 1,
    });
    expect(explanation.dominant?.key).toBe("ratingRange");
  });

  it("标出是否违反硬约束", () => {
    expect(explainTeamCost(ZERO).hasHardConstraintViolation).toBe(false);
    expect(
      explainTeamCost({ ...ZERO, eligibilityViolationCount: 1 }).hasHardConstraintViolation,
    ).toBe(true);
    expect(
      explainTeamCost({ ...ZERO, unavailableStudentCount: 1 }).hasHardConstraintViolation,
    ).toBe(true);
    // 队伍不完整**不**算硬约束违规：人数少有时是不可避免的（例如奇数人数）
    expect(explainTeamCost({ ...ZERO, incompleteTeam: true }).hasHardConstraintViolation).toBe(
      false,
    );
  });
});

describe("确定性与纯函数性质", () => {
  it("相同输入重复计算结果完全一致", () => {
    const components: TeamCostComponents = {
      eligibilityViolationCount: 1,
      unavailableStudentCount: 0,
      incompleteTeam: false,
      ratingRange: 4,
      ratingStandardDeviation: 1.5,
      repeatedTeammatePairCount: 3,
      acceptedPartnerPairCount: 2,
    };
    const runs = Array.from({ length: 20 }, () => computeTeamCost(components));
    expect(new Set(runs).size).toBe(1);
  });

  it("不修改入参", () => {
    const components = { ...ZERO, ratingRange: 5 };
    computeTeamCost(components);
    expect(components.ratingRange).toBe(5);
  });

  it("评分统计与顺序无关（同一批人换个顺序结果一样）", () => {
    const ratings = [3, 9, 5, 7, 1];
    const shuffled = [7, 1, 9, 3, 5];
    expect(ratingRange(shuffled)).toBe(ratingRange(ratings));
    expect(ratingStandardDeviation(shuffled)).toBeCloseTo(ratingStandardDeviation(ratings), 12);
  });
});
