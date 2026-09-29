// @vitest-environment node
import { describe, expect, it } from "vitest";

import {
  JUDGE_APPROVAL_LABELS,
  JUDGE_APPROVAL_STATUSES,
  type JudgeApprovalStatus,
  type JudgeEligibilityInput,
  checkJudgeEligibility,
  eligibleFormatIds,
  isJudgeEligible,
} from "@/lib/domain/judge-eligibility";
import { PROFILE_STATUSES, type ProfileStatus } from "@/lib/validation/admin";

/**
 * 裁判可指派性。
 *
 * 这条规则 Phase 5 会直接用来决定"谁能被排进比赛"，因此在这里就穷举覆盖：
 * 3（账号状态）× 4（审批状态）× 3（资格情况）= 36 种组合，
 * 再加上"有多个赛制时只挑对的那些"等边界情况。
 */

const PF = "format-pf";
const WSDC = "format-wsdc";

const ALL_STATUSES: ProfileStatus[] = ["active", "inactive", "suspended"];
const ALL_APPROVALS: JudgeApprovalStatus[] = ["pending", "approved", "rejected", "suspended"];

type QualificationCase = {
  name: string;
  qualifications: JudgeEligibilityInput["qualifications"];
  /** 对 PF 的期望结果 */
  expected: "eligible" | "no_qualification" | "qualification_not_approved";
};

const QUALIFICATION_CASES: QualificationCase[] = [
  { name: "完全没有资格记录", qualifications: [], expected: "no_qualification" },
  {
    name: "有 PF 资格且已批准",
    qualifications: [{ formatId: PF, approved: true }],
    expected: "eligible",
  },
  {
    name: "有 PF 资格但未批准",
    qualifications: [{ formatId: PF, approved: false }],
    expected: "qualification_not_approved",
  },
  {
    name: "只有别的赛制资格",
    qualifications: [{ formatId: WSDC, approved: true }],
    expected: "no_qualification",
  },
];

describe("状态清单", () => {
  it("测试覆盖的账号状态清单与校验模块导出的完全一致", () => {
    // 这条断言的作用：如果将来新增一种账号状态，而穷举测试的清单没跟着更新，
    // 这里会立刻失败，而不是让穷举悄悄少覆盖一种状态。
    expect([...ALL_STATUSES].sort()).toEqual([...PROFILE_STATUSES].sort());
  });

  it("恰好是数据库里的四种审批状态", () => {
    expect([...JUDGE_APPROVAL_STATUSES]).toEqual(["pending", "approved", "rejected", "suspended"]);
  });

  it("每种状态都有中文名称", () => {
    for (const status of JUDGE_APPROVAL_STATUSES) {
      expect(JUDGE_APPROVAL_LABELS[status]).toBeTruthy();
    }
  });
});

describe("穷举 3 × 4 × 4 = 48 种组合", () => {
  let combinationCount = 0;

  for (const profileStatus of ALL_STATUSES) {
    for (const approvalStatus of ALL_APPROVALS) {
      for (const qualificationCase of QUALIFICATION_CASES) {
        combinationCount += 1;

        it(`账号=${profileStatus} 审批=${approvalStatus} 资格=${qualificationCase.name}`, () => {
          const judge: JudgeEligibilityInput = {
            profileStatus,
            approvalStatus,
            qualifications: qualificationCase.qualifications,
          };

          const result = checkJudgeEligibility(judge, PF);

          if (profileStatus !== "active") {
            expect(result.eligible).toBe(false);
            if (!result.eligible) expect(result.code).toBe("account_not_active");
            return;
          }

          if (approvalStatus !== "approved") {
            expect(result.eligible).toBe(false);
            if (!result.eligible) expect(result.code).toBe("not_approved");
            return;
          }

          if (qualificationCase.expected === "eligible") {
            expect(result.eligible).toBe(true);
          } else {
            expect(result.eligible).toBe(false);
            if (!result.eligible) expect(result.code).toBe(qualificationCase.expected);
          }
        });
      }
    }
  }

  it("组合数确实是 48", () => {
    expect(combinationCount).toBe(48);
    expect(ALL_STATUSES.length * ALL_APPROVALS.length * QUALIFICATION_CASES.length).toBe(48);
  });
});

describe("检查顺序决定提示信息", () => {
  const notActive: JudgeEligibilityInput = {
    profileStatus: "suspended",
    approvalStatus: "pending",
    qualifications: [],
  };

  it("账号有问题时，先报账号问题（而不是审批或资格）", () => {
    const result = checkJudgeEligibility(notActive, PF);
    expect(result.eligible).toBe(false);
    if (!result.eligible) expect(result.code).toBe("account_not_active");
  });

  it("账号正常但未批准时，报审批问题（而不是资格）", () => {
    const result = checkJudgeEligibility(
      { profileStatus: "active", approvalStatus: "pending", qualifications: [] },
      PF,
    );
    expect(result.eligible).toBe(false);
    if (!result.eligible) expect(result.code).toBe("not_approved");
  });

  it("已批准但无资格时，才报资格问题", () => {
    const result = checkJudgeEligibility(
      { profileStatus: "active", approvalStatus: "approved", qualifications: [] },
      PF,
    );
    expect(result.eligible).toBe(false);
    if (!result.eligible) expect(result.code).toBe("no_qualification");
  });

  it("提示信息里包含审批状态的中文名称，便于管理员判断", () => {
    const result = checkJudgeEligibility(
      { profileStatus: "active", approvalStatus: "rejected", qualifications: [] },
      PF,
    );
    if (!result.eligible) expect(result.message).toContain(JUDGE_APPROVAL_LABELS.rejected);
  });
});

describe("多个赛制时只挑对的那个", () => {
  const judge: JudgeEligibilityInput = {
    profileStatus: "active",
    approvalStatus: "approved",
    qualifications: [
      { formatId: PF, approved: true },
      { formatId: WSDC, approved: false },
      { formatId: "format-bp", approved: true },
    ],
  };

  it("有资格的赛制 → 可以指派", () => {
    expect(isJudgeEligible(judge, PF)).toBe(true);
    expect(isJudgeEligible(judge, "format-bp")).toBe(true);
  });

  it("资格未批准的赛制 → 不可以指派", () => {
    expect(isJudgeEligible(judge, WSDC)).toBe(false);
  });

  it("完全没有记录的赛制 → 不可以指派", () => {
    expect(isJudgeEligible(judge, "format-one-v-one")).toBe(false);
  });

  it("eligibleFormatIds 只列出已获资格且已批准的赛制，并且稳定排序", () => {
    expect(eligibleFormatIds(judge)).toEqual(["format-bp", PF]);
  });

  it("账号或审批不通过时，可指派赛制列表为空", () => {
    expect(eligibleFormatIds({ ...judge, profileStatus: "inactive" })).toEqual([]);
    expect(eligibleFormatIds({ ...judge, approvalStatus: "suspended" })).toEqual([]);
  });
});

describe("健壮性", () => {
  it("任何审批状态字符串都不会抛异常", () => {
    const garbage = ["", "APPROVED", "approved ", "__proto__", "unknown"];
    for (const value of garbage) {
      const judge = {
        profileStatus: "active" as ProfileStatus,
        approvalStatus: value as JudgeApprovalStatus,
        qualifications: [{ formatId: PF, approved: true }],
      };
      expect(() => checkJudgeEligibility(judge, PF)).not.toThrow();
      // 不认识的状态一律视为"未批准"，而不是放行
      expect(isJudgeEligible(judge, PF)).toBe(false);
    }
  });

  it("是纯函数：重复调用结果一致", () => {
    const judge: JudgeEligibilityInput = {
      profileStatus: "active",
      approvalStatus: "approved",
      qualifications: [{ formatId: PF, approved: true }],
    };
    expect(checkJudgeEligibility(judge, PF)).toEqual(checkJudgeEligibility(judge, PF));
  });

  it("失败结果里保留被查询的赛制，便于记录与排查", () => {
    const result = checkJudgeEligibility(
      { profileStatus: "active", approvalStatus: "pending", qualifications: [] },
      WSDC,
    );
    expect(result.formatId).toBe(WSDC);
  });
});
