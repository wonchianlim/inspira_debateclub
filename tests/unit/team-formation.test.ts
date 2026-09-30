// @vitest-environment node
import { describe, expect, it } from "vitest";

import { computeTeamCost } from "@/lib/domain/pairing-cost";
import {
  type TeamCandidate,
  type TeamFormationFormat,
  formTeams,
} from "@/lib/domain/team-formation";

/**
 * 队伍生成（规范第 10.3 节）。
 *
 * 队伍人数取自**数据库配置**（PF=2、JWSD=3、WSDC=3、BP=2、ONE_V_ONE=1），
 * 与规范第 10.8 节要求的"五种赛制"对应。
 */

const PF: TeamFormationFormat = { formatId: "fmt-pf", code: "PF", teamSize: 2 };
const WSDC: TeamFormationFormat = { formatId: "fmt-wsdc", code: "WSDC", teamSize: 3 };
const BP: TeamFormationFormat = { formatId: "fmt-bp", code: "BP", teamSize: 2 };
const ONE_V_ONE: TeamFormationFormat = { formatId: "fmt-1v1", code: "ONE_V_ONE", teamSize: 1 };

function person(
  studentId: string,
  rating: number,
  extra: Partial<TeamCandidate> = {},
): TeamCandidate {
  return {
    studentId,
    rating,
    eligible: true,
    available: true,
    acceptedPartnerStudentIds: [],
    previousTeammateStudentIds: [],
    ...extra,
  };
}

/** 互相接受搭档：两边的列表都要写，单向不算。 */
function mutualPartners(a: TeamCandidate, b: TeamCandidate): void {
  (a.acceptedPartnerStudentIds as string[]).push(b.studentId);
  (b.acceptedPartnerStudentIds as string[]).push(a.studentId);
}

describe("评分相近的人被分到一起（规范的核心目标）", () => {
  it("PF：评分 3/4/7/8 分成 (3,4) 与 (7,8)，而不是交叉分组", () => {
    const result = formTeams(
      [person("s1", 3), person("s2", 4), person("s3", 7), person("s4", 8)],
      PF,
    );

    expect(result.teams).toHaveLength(2);
    const groups = result.teams.map((team) => team.memberStudentIds);
    expect(groups).toContainEqual(["s1", "s2"]);
    expect(groups).toContainEqual(["s3", "s4"]);
  });

  it("连续分组的总成本低于交叉分组（用成本函数算出交叉分组作对照）", () => {
    /*
     * ⚠️ 不能靠"换个传入顺序"来构造交叉分组 —— 算法内部会先按评分排序，
     * 传入顺序根本影响不了结果（那正是确定性所要求的）。
     * 因此这里用成本函数**手工算出**交叉分组的成本作为对照。
     */
    const consecutive = formTeams(
      [person("s1", 3), person("s2", 4), person("s3", 7), person("s4", 8)],
      PF,
    );

    // 交叉分组 (3,8) 与 (4,7)：极差各为 5
    const crossedTeamCost = computeTeamCost({
      eligibilityViolationCount: 0,
      unavailableStudentCount: 0,
      incompleteTeam: false,
      ratingRange: 5,
      ratingStandardDeviation: 2.5,
      repeatedTeammatePairCount: 0,
      acceptedPartnerPairCount: 0,
    });
    const crossedTotal = crossedTeamCost * 2;

    expect(consecutive.totalCost).toBeLessThan(crossedTotal);
    // 连续分组的极差各为 1，成本应为 10*1 + 4*0.5 = 12 每队、共 24
    expect(consecutive.totalCost).toBe(24);
  });

  it("评分完全相同时成本为 0（除非有搭档减分）", () => {
    const result = formTeams([person("s1", 5), person("s2", 5)], PF);
    expect(result.teams[0]?.cost).toBe(0);
  });

  it("队伍平均评分被算出（四舍五入到两位）", () => {
    const result = formTeams([person("s1", 3), person("s2", 4)], WSDC);
    void result;
    const two = formTeams([person("s1", 3), person("s2", 4)], PF);
    expect(two.teams[0]?.averageRating).toBe(3.5);
  });
});

describe("已接受的搭档请求优先于评分相近（规范 10.3 末句）", () => {
  it("评分差很大也会被锁在一起 —— 搭档请求压过评分相近", () => {
    const a = person("s1", 1);
    const b = person("s2", 10);
    mutualPartners(a, b);

    const result = formTeams([a, b], PF);

    expect(result.teams).toHaveLength(1);
    expect(result.teams[0]?.memberStudentIds).toEqual(["s1", "s2"]);
    expect(result.teams[0]?.fromAcceptedPartner).toBe(true);
    // 评分差 9 分 → 必须给出提醒，而不是悄悄通过
    expect(result.warnings.some((warning) => warning.code === "large_rating_spread")).toBe(true);
  });

  it("已接受搭档会让队伍成本**降低**（−50）", () => {
    const withPartner = formTeams([person("s1", 5), person("s2", 5)], PF);
    const a = person("s1", 5);
    const b = person("s2", 5);
    mutualPartners(a, b);
    const withRequest = formTeams([a, b], PF);

    expect(withRequest.totalCost).toBe(withPartner.totalCost - 50);
  });

  it("**单向**请求不算数：对方还没答应", () => {
    const a = person("s1", 5, { acceptedPartnerStudentIds: ["s2"] });
    const b = person("s2", 5); // b 没有接受 a

    const result = formTeams([a, b], PF);

    expect(result.teams[0]?.fromAcceptedPartner).toBe(false);
  });

  it("WSDC（3 人一队）：已接受的两人会被补上第三位评分最接近的人", () => {
    const a = person("s1", 5);
    const b = person("s2", 6);
    mutualPartners(a, b);

    const result = formTeams([a, b, person("s3", 5), person("s4", 10), person("s5", 1)], WSDC);

    const partnerTeam = result.teams.find((team) => team.fromAcceptedPartner);
    expect(partnerTeam?.memberStudentIds).toContain("s1");
    expect(partnerTeam?.memberStudentIds).toContain("s2");
    // 种子均值 5.5，最接近的是 s3(5) 而不是 s4(10) 或 s5(1)
    expect(partnerTeam?.memberStudentIds).toContain("s3");
  });

  it("搭档组人数超过一支队伍时给出警告并让管理员处理", () => {
    const a = person("s1", 5);
    const b = person("s2", 5);
    const c = person("s3", 5);
    mutualPartners(a, b);
    mutualPartners(b, c);
    mutualPartners(a, c);

    const result = formTeams([a, b, c], PF);

    expect(result.warnings.some((warning) => warning.code === "partner_group_too_large")).toBe(
      true,
    );
  });

  it("补位时评分差距过大要如实提示，而不是假装'评分相近'", () => {
    const a = person("s1", 5);
    const b = person("s2", 5);
    mutualPartners(a, b);

    const result = formTeams([a, b, person("s3", 10)], WSDC);

    expect(result.warnings.some((warning) => warning.code === "partner_completion_imperfect")).toBe(
      true,
    );
  });
});

/**
 * 回归测试：同一个人**绝不能**在同一支队伍里出现两次。
 *
 * 实测抓到的缺陷：给"已接受搭档"的种子补位时，剩余池子里**仍然包含种子成员自己**，
 * 于是补位又选中了其中一位，产生 `["s1","s1","s2"]` 这样的队伍。
 * 下游的队伍成员与比赛名单会完全错乱，而且这种错误在界面上很难一眼看出。
 */
describe("回归：同一个人不会在同一支队伍里出现两次", () => {
  it("WSDC 里给已接受搭档补位时不会把种子成员再选一遍", () => {
    const a = person("s1", 5);
    const b = person("s2", 6);
    mutualPartners(a, b);

    const result = formTeams([a, b, person("s3", 5), person("s4", 10)], WSDC);

    for (const team of result.teams) {
      expect(
        new Set(team.memberStudentIds).size,
        `队伍 ${team.memberStudentIds.join(",")} 有重复成员`,
      ).toBe(team.memberStudentIds.length);
    }
  });

  it("每支队伍的人数恰好等于 team_size（不重复、不缺失）", () => {
    const a = person("s1", 5);
    const b = person("s2", 6);
    mutualPartners(a, b);

    const result = formTeams([a, b, person("s3", 5), person("s4", 6)], WSDC);

    for (const team of result.teams) {
      expect(team.memberStudentIds).toHaveLength(WSDC.teamSize);
    }
  });

  it("所有人最多出现在一支队伍里", () => {
    const a = person("s1", 5);
    const b = person("s2", 6);
    mutualPartners(a, b);

    const result = formTeams(
      [a, b, person("s3", 5), person("s4", 6), person("s5", 7), person("s6", 8)],
      WSDC,
    );

    const appearances = new Map<string, number>();
    for (const team of result.teams) {
      for (const id of team.memberStudentIds) {
        appearances.set(id, (appearances.get(id) ?? 0) + 1);
      }
    }
    for (const [studentId, count] of appearances) {
      expect(count, `学生 ${studentId} 出现在 ${count} 支队伍里`).toBe(1);
    }
  });
});

describe("五种赛制的队伍人数", () => {
  it("ONE_V_ONE（1 人一队）：每人一队", () => {
    const result = formTeams([person("s1", 3), person("s2", 7)], ONE_V_ONE);
    expect(result.teams).toHaveLength(2);
    expect(result.teams.every((team) => team.memberStudentIds.length === 1)).toBe(true);
    expect(result.remainderStudentIds).toHaveLength(0);
  });

  it("PF（2 人一队）", () => {
    const result = formTeams(
      [person("s1", 3), person("s2", 4), person("s3", 5), person("s4", 6)],
      PF,
    );
    expect(result.teams).toHaveLength(2);
  });

  it("BP（2 人一队）", () => {
    const result = formTeams([person("s1", 3), person("s2", 4)], BP);
    expect(result.teams).toHaveLength(1);
  });

  it("WSDC（3 人一队）", () => {
    const result = formTeams([person("s1", 3), person("s2", 4), person("s3", 5)], WSDC);
    expect(result.teams).toHaveLength(1);
    expect(result.teams[0]?.memberStudentIds).toHaveLength(3);
  });

  it("JWSD（3 人一队）与 WSDC 规则一致", () => {
    const JWSD: TeamFormationFormat = { formatId: "fmt-jwsd", code: "JWSD", teamSize: 3 };
    const result = formTeams(
      [
        person("s1", 3),
        person("s2", 4),
        person("s3", 5),
        person("s4", 6),
        person("s5", 7),
        person("s6", 8),
      ],
      JWSD,
    );
    expect(result.teams).toHaveLength(2);
    expect(result.remainderStudentIds).toHaveLength(0);
  });
});

describe("奇数人数与余数", () => {
  it("PF 有 5 人 → 2 支队伍 + 1 人余数，并给出警告", () => {
    const result = formTeams(
      [person("s1", 1), person("s2", 2), person("s3", 3), person("s4", 4), person("s5", 5)],
      PF,
    );
    expect(result.teams).toHaveLength(2);
    expect(result.remainderStudentIds).toHaveLength(1);
    expect(result.warnings.some((warning) => warning.code === "incomplete_team_remainder")).toBe(
      true,
    );
  });

  it("WSDC 有 7 人 → 2 支队伍 + 1 人余数", () => {
    const people = Array.from({ length: 7 }, (_, index) => person(`s${index + 1}`, 5));
    const result = formTeams(people, WSDC);
    expect(result.teams).toHaveLength(2);
    expect(result.remainderStudentIds).toHaveLength(1);
  });

  it("只有 1 人时进入余数，不产生队伍", () => {
    const result = formTeams([person("s1", 5)], PF);
    expect(result.teams).toHaveLength(0);
    expect(result.remainderStudentIds).toEqual(["s1"]);
  });

  it("没有人时不产生队伍也不报错", () => {
    const result = formTeams([], PF);
    expect(result.teams).toEqual([]);
    expect(result.remainderStudentIds).toEqual([]);
  });
});

describe("资格与可用性（硬约束，成本很大）", () => {
  it("不满足资格的人被编入时给出警告，且成本很高", () => {
    const result = formTeams([person("s1", 5), person("s2", 5, { eligible: false })], PF);

    expect(result.warnings.some((warning) => warning.code === "eligibility_violation")).toBe(true);
    // 1000 的资格违规权重会体现出来
    expect(result.teams[0]?.cost).toBeGreaterThanOrEqual(1000);
  });

  it("当前不可用的人被编入时给出警告", () => {
    const result = formTeams([person("s1", 5), person("s2", 5, { available: false })], PF);
    expect(result.warnings.some((warning) => warning.code === "unavailable_member")).toBe(true);
    expect(result.teams[0]?.cost).toBeGreaterThanOrEqual(500);
  });

  it("资格违规比评分差距更严重（权重直接体现优先级）", () => {
    const ineligible = formTeams([person("s1", 5), person("s2", 5, { eligible: false })], PF);
    const spread = formTeams([person("s1", 1), person("s2", 10)], PF);
    expect(ineligible.totalCost).toBeGreaterThan(spread.totalCost);
  });
});

describe("重复队友只是轻惩罚（规范：稳定搭档是被允许的）", () => {
  it("以前做过队友时给出提示，但不会阻止组队", () => {
    const result = formTeams(
      [
        person("s1", 5, { previousTeammateStudentIds: ["s2"] }),
        person("s2", 5, { previousTeammateStudentIds: ["s1"] }),
      ],
      PF,
    );

    expect(result.teams).toHaveLength(1);
    expect(result.warnings.some((warning) => warning.code === "repeated_teammate")).toBe(true);
    // 权重只有 2，远小于资格违规的 1000
    expect(result.teams[0]?.cost).toBe(2);
  });

  it("已接受搭档**不**算重复队友（不应重复提示）", () => {
    const a = person("s1", 5, { previousTeammateStudentIds: ["s2"] });
    const b = person("s2", 5, { previousTeammateStudentIds: ["s1"] });
    mutualPartners(a, b);

    const result = formTeams([a, b], PF);
    expect(result.warnings.some((warning) => warning.code === "repeated_teammate")).toBe(false);
  });
});

describe("确定性（规范 10.5：相同输入重跑得到相同结果）", () => {
  const people = [
    person("s5", 5),
    person("s1", 3),
    person("s3", 5),
    person("s2", 3),
    person("s4", 8),
    person("s6", 8),
  ];

  it("同一输入重复运行结果完全一致", () => {
    expect(formTeams(people, PF)).toEqual(formTeams(people, PF));
  });

  it("打乱输入顺序不影响结果（内部按'评分，再按 id'稳定排序）", () => {
    const shuffled = [...people].reverse();
    expect(formTeams(shuffled, PF)).toEqual(formTeams(people, PF));
  });

  it("**评分完全相同**时按学生 id 稳定打破平局", () => {
    const result = formTeams(
      [person("s3", 5), person("s1", 5), person("s2", 5), person("s4", 5)],
      PF,
    );
    const groups = result.teams.map((team) => team.memberStudentIds);
    // 全部同分 → 只能靠 id 排序，s1/s2 一组、s3/s4 一组
    expect(groups).toContainEqual(["s1", "s2"]);
    expect(groups).toContainEqual(["s3", "s4"]);
  });

  it("不修改入参", () => {
    const snapshot = JSON.stringify(people);
    formTeams(people, PF);
    expect(JSON.stringify(people)).toBe(snapshot);
  });

  it("队伍成员 id 始终有序（便于比较与去重）", () => {
    const result = formTeams(people, PF);
    for (const team of result.teams) {
      expect(team.memberStudentIds).toEqual([...team.memberStudentIds].sort());
    }
  });
});

describe("可解释性：每支队伍都带成本明细", () => {
  it("成本明细的逐项之和等于该队伍的成本", () => {
    const result = formTeams([person("s1", 1), person("s2", 8)], PF);
    const team = result.teams[0];
    const sum = team?.costBreakdown.terms.reduce((total, term) => total + term.contribution, 0);
    expect(sum).toBe(team?.cost);
  });

  it("总成本等于各队成本之和", () => {
    const result = formTeams(
      [person("s1", 1), person("s2", 2), person("s3", 8), person("s4", 9)],
      PF,
    );
    const sum = result.teams.reduce((total, team) => total + team.cost, 0);
    expect(result.totalCost).toBe(sum);
  });

  it("评分差距大的队伍会指出主导成本项", () => {
    const result = formTeams([person("s1", 1), person("s2", 9)], PF);
    expect(result.teams[0]?.costBreakdown.dominant?.key).toBe("ratingRange");
  });
});
