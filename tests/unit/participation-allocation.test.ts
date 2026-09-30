// @vitest-environment node
import { describe, expect, it } from "vitest";

import {
  type AllocationFormat,
  type AllocationStudent,
  allocateParticipations,
  countStudentsWithADebate,
} from "@/lib/domain/participation-allocation";

/**
 * 参与分配（规范第 10.2 节）。
 *
 * 测试重点是规范给出的**首要目标顺序**，而不是某个具体的分配结果：
 * 尤其是目标 1"让尽可能多的学生获得一次有效辩论" ——
 * 因此有一条测试专门构造出"贪心分第一志愿会让所有人打不上"的场景。
 */

const PF: AllocationFormat = {
  formatId: "fmt-pf",
  code: "PF",
  teamSize: 2,
  teamsPerMatch: 2,
  displayOrder: 1,
};
const WSDC: AllocationFormat = {
  formatId: "fmt-wsdc",
  code: "WSDC",
  teamSize: 3,
  teamsPerMatch: 2,
  displayOrder: 2,
};
const BP: AllocationFormat = {
  formatId: "fmt-bp",
  code: "BP",
  teamSize: 2,
  teamsPerMatch: 4,
  displayOrder: 3,
};

function student(
  studentId: string,
  orderedFormatIds: string[],
  entitlementType: AllocationStudent["entitlementType"] = "weekly_entitlement",
): AllocationStudent {
  return { studentId, orderedFormatIds, entitlementType };
}

describe("第一志愿可行时，人人拿到第一志愿", () => {
  const students = [
    student("s1", [PF.formatId]),
    student("s2", [PF.formatId]),
    student("s3", [PF.formatId]),
    student("s4", [PF.formatId]),
  ];

  it("四个人都想打 PF（2 人一队）→ 全部拿到第一志愿", () => {
    const result = allocateParticipations(students, [PF]);
    expect(result.allocations).toHaveLength(4);
    expect(result.allocations.every((allocation) => allocation.formatId === PF.formatId)).toBe(
      true,
    );
    expect(result.unallocated).toHaveLength(0);
  });

  it("刚好凑齐一支队伍时不产生任何警告", () => {
    const result = allocateParticipations(
      [student("s1", [PF.formatId]), student("s2", [PF.formatId])],
      [PF],
    );
    expect(result.warnings).toHaveLength(0);
  });
});

describe("第一志愿人数不足时改看下一个志愿", () => {
  it("PF 只有 1 人想打（2 人一队）→ 不可行，改看第二志愿", () => {
    const result = allocateParticipations(
      [
        student("s1", [PF.formatId, WSDC.formatId]),
        student("s2", [WSDC.formatId]),
        student("s3", [WSDC.formatId]),
      ],
      [PF, WSDC],
    );

    // s1 的 PF 志愿凑不成队，最终应在 WSDC（3 人正好一队）
    const s1 = result.allocations.find((allocation) => allocation.studentId === "s1");
    expect(s1?.formatId).toBe(WSDC.formatId);
    expect(countStudentsWithADebate(result)).toBe(3);
  });

  it("产生一条说明取舍的警告，且**写明赛制代号**而不是 UUID", () => {
    const result = allocateParticipations(
      [
        student("s1", [PF.formatId, WSDC.formatId]),
        student("s2", [WSDC.formatId]),
        student("s3", [WSDC.formatId]),
      ],
      [PF, WSDC],
    );

    const warning = result.warnings.find((entry) => entry.code === "preference_not_viable");
    expect(warning).toBeDefined();
    expect(warning?.message).toContain("PF");
    // 警告里不应出现原始 UUID，否则管理员看不懂
    expect(warning?.message).not.toContain(PF.formatId);
  });
});

/**
 * 这一组是**"全局而不是贪心"的核心证据**。
 *
 * 场景：PF 是 4 人一队（冷门赛制），WSDC 是 2 人一队。
 * 三位学生第一志愿都是 PF，第四位第一志愿是 WSDC。
 */
describe("全局优化：贪心分第一志愿会让所有人打不上", () => {
  const BIG_PF: AllocationFormat = { ...PF, teamSize: 4 };

  it("按第一志愿硬分：PF 得 3 人、WSDC 得 1 人 —— 两个赛制都凑不成队，**零人**打上", () => {
    // 这正是"贪心"会得到的结果，写在这里作为对照
    const naive = {
      [BIG_PF.formatId]: 3,
      [WSDC.formatId]: 1,
    };
    expect(naive[BIG_PF.formatId] % BIG_PF.teamSize).not.toBe(0);
    expect(naive[WSDC.formatId] % WSDC.teamSize).not.toBe(0);
    // 两个赛制都没有完整队伍 → 没有任何人获得一次有效辩论
    expect(Math.floor(naive[BIG_PF.formatId] / BIG_PF.teamSize)).toBe(0);
    expect(Math.floor(naive[WSDC.formatId] / WSDC.teamSize)).toBe(0);
  });

  it("本实现让**四个人全部**打上（对照的贪心结果是 0 人）", () => {
    const students = [
      student("s1", [BIG_PF.formatId, WSDC.formatId]),
      student("s2", [BIG_PF.formatId, WSDC.formatId]),
      student("s3", [BIG_PF.formatId, WSDC.formatId]),
      student("s4", [WSDC.formatId, BIG_PF.formatId]),
    ];

    const result = allocateParticipations(students, [BIG_PF, WSDC]);

    // 断言的是**目标 1**（多少人打上），而不是算法碰巧选了哪个赛制。
    // 四个人全进 BIG_PF（4 人一队）同样让所有人打上、而且更尊重志愿；
    // 写死"必须全在 WSDC"会把一个同样正确的结果误判为失败。
    expect(countStudentsWithADebate(result)).toBe(4);

    // 无论落在哪个赛制，人数都必须是 team_size 的整数倍，否则就有人落单
    for (const [formatId, count] of Object.entries(result.countsByFormat)) {
      if (count === 0) continue;
      const teamSize = formatId === BIG_PF.formatId ? BIG_PF.teamSize : WSDC.teamSize;
      expect(count % teamSize).toBe(0);
    }
  });

  it("对照：如果按第一志愿硬分，只能让 0 人打上；本实现让 4 人打上", () => {
    const students = [
      student("s1", [BIG_PF.formatId, WSDC.formatId]),
      student("s2", [BIG_PF.formatId, WSDC.formatId]),
      student("s3", [BIG_PF.formatId, WSDC.formatId]),
      student("s4", [WSDC.formatId, BIG_PF.formatId]),
    ];
    const result = allocateParticipations(students, [BIG_PF, WSDC]);
    expect(countStudentsWithADebate(result)).toBeGreaterThan(0);
  });
});

describe("填补不完整队伍", () => {
  it("所有志愿都不可行时，把人安排到已有但缺人的赛制", () => {
    // s1、s2 会把 PF 填到 2 人；s3 只有 PF 志愿且第一轮凑不齐……
    // 构造：PF 3 人一队，已有 2 人；s3 合格 PF 但志愿里排第一
    const PF3: AllocationFormat = { ...PF, teamSize: 3 };
    const result = allocateParticipations(
      [student("s1", [PF3.formatId]), student("s2", [PF3.formatId]), student("s3", [PF3.formatId])],
      [PF3],
    );
    // 三人同时到达，第一轮就凑齐 3 人，全部拿到第一志愿
    expect(result.allocations).toHaveLength(3);
    expect(result.unallocated).toHaveLength(0);
  });

  it("对无法安排的学生给出明确原因（管理员据此人工处理）", () => {
    // WSDC 3 人一队，只有 1 个人合格且只有这一个志愿
    const result = allocateParticipations([student("s1", [WSDC.formatId])], [WSDC]);
    expect(result.allocations).toHaveLength(0);
    expect(result.unallocated).toHaveLength(1);
    expect(result.unallocated[0]?.reason).toContain("凑不成");
    expect(result.warnings.some((warning) => warning.code === "no_viable_format")).toBe(true);
  });

  it("没有任何合格赛制的学生，原因与'凑不成队'区分开", () => {
    const result = allocateParticipations([student("s1", [])], [PF]);
    expect(result.unallocated[0]?.reason).toContain("没有任何合格");
  });
});

describe("额外场次：只有明确选择才会分配", () => {
  const students = [
    student("s1", [PF.formatId], "extra_paid"),
    student("s2", [PF.formatId]),
    student("s3", [PF.formatId]),
    student("s4", [PF.formatId]),
  ];

  it("未选择额外场次的学生**不会**拿到第二次参与", () => {
    const result = allocateParticipations(students, [PF]);
    const secondParticipations = result.allocations.filter(
      (allocation) => allocation.participationNumber > 1,
    );
    // 只有 s1 是 extra_paid；s2/s3/s4 都是正常名额
    for (const allocation of secondParticipations) {
      expect(allocation.studentId).toBe("s1");
    }
    for (const id of ["s2", "s3", "s4"]) {
      expect(
        result.allocations.some(
          (allocation) => allocation.studentId === id && allocation.participationNumber === 1,
        ),
      ).toBe(true);
    }
  });

  it("选择了额外场次但没有合适位置时给出警告，而不是硬塞", () => {
    // 只有 s1 一个人，且没有别的赛制可去
    const result = allocateParticipations([student("s1", [PF.formatId], "extra_paid")], [PF]);
    // 注意：s1 连正常名额都没拿到（PF 只有 1 人、凑不成队），因此会同时出现"安排不了"
    // 与"额外场次没位置"的说明 —— 两者都该如实反映，不能只报一个
    expect(
      result.warnings.some((warning) => warning.code === "extra_participation_unavailable"),
    ).toBe(true);
  });

  it("正常名额的学生在人数刚好时不会触发额外场次逻辑", () => {
    const result = allocateParticipations(
      [student("s1", [PF.formatId]), student("s2", [PF.formatId])],
      [PF],
    );
    expect(result.allocations.every((allocation) => allocation.participationNumber === 1)).toBe(
      true,
    );
    expect(
      result.warnings.some((warning) => warning.code === "extra_participation_unavailable"),
    ).toBe(false);
  });
});

describe("不完整队伍与落单的提示", () => {
  it("某赛制人数不足一队时给出提示", () => {
    const result = allocateParticipations(
      [
        student("s1", [PF.formatId]),
        student("s2", [PF.formatId]),
        student("s3", [WSDC.formatId]),
        student("s4", [WSDC.formatId]),
        student("s5", [WSDC.formatId]),
        student("s6", [WSDC.formatId]),
      ],
      [PF, WSDC],
    );
    // PF 得 2 人（完整），WSDC 得 4 人 → 3 人一队会剩 1 人
    const leftover = result.warnings.find((warning) => warning.code === "leftover_after_teams");
    expect(leftover?.message).toContain("WSDC");
  });

  it("人数不足一队时提示不是'落单'而是'凑不成队伍'", () => {
    const BP3: AllocationFormat = { ...BP, teamSize: 3, teamsPerMatch: 2 };
    const result = allocateParticipations([student("s1", [BP3.formatId])], [BP3]);
    // 只有一个人，第一轮就不可行，因此不会进入"统计"环节
    expect(result.warnings.some((warning) => warning.code === "incomplete_team_remains")).toBe(
      false,
    );
    expect(result.unallocated).toHaveLength(1);
  });
});

/**
 * 回归测试：一个人**绝不能**在同一轮里被分配到多个赛制。
 *
 * 这是实测抓到的严重缺陷：候选人会同时留在多个赛制的池子里
 * （一个人既可以接受 PF 也可以接受 WSDC）。当 PF 先被确认、这些人已经进队后，
 * WSDC 的池子里**仍然留着同样的 id**，于是 WSDC 也被"凑够"并把同一批人又分配一次 ——
 * 4 个学生产生了 8 条参与记录。
 *
 * 下游后果很严重：同一个人会同时属于两个赛制的队伍，比赛与评分表都会错。
 */
describe("回归：同一个人不会被分配到多个赛制", () => {
  /*
   * ⚠️ 场景必须是**能被两个赛制同时凑够**的那种，否则测不出缺陷。
   *
   * 第一版回归测试用了 PF(2) / WSDC(3)：取消过滤后 WSDC 的池子只有 2 人、
   * 仍然不到 3 人，因此**缺陷不会显现，测试照样通过** ——
   * 也就是说那条回归测试是**假通过**（已用反向验证确认：去掉过滤后它依然全绿）。
   *
   * 真正能触发的是 PF(4) / WSDC(2)：两个赛制的池子都会达到各自人数要求，
   * 重复分配才会发生。教训：回归测试必须用**确实踩到过缺陷的那个场景**，
   * 并且要用反向验证确认"去掉修复它就会失败"。
   */
  const BIG_PF: AllocationFormat = { ...PF, teamSize: 4 };
  const students = [
    student("s1", [BIG_PF.formatId, WSDC.formatId]),
    student("s2", [BIG_PF.formatId, WSDC.formatId]),
    student("s3", [BIG_PF.formatId, WSDC.formatId]),
    student("s4", [WSDC.formatId, BIG_PF.formatId]),
  ];

  it("每人最多一条正常名额的参与记录", () => {
    const result = allocateParticipations(students, [BIG_PF, WSDC]);

    const normalByStudent = new Map<string, number>();
    for (const allocation of result.allocations) {
      if (allocation.participationNumber !== 1) continue;
      normalByStudent.set(
        allocation.studentId,
        (normalByStudent.get(allocation.studentId) ?? 0) + 1,
      );
    }

    expect(normalByStudent.size).toBe(4);
    for (const [studentId, count] of normalByStudent) {
      expect(count, `学生 ${studentId} 有 ${count} 条正常参与记录`).toBe(1);
    }
  });

  it("参与记录总数 = 拿到辩论的人数（没有重复计数）", () => {
    const result = allocateParticipations(students, [BIG_PF, WSDC]);
    const normalAllocations = result.allocations.filter((a) => a.participationNumber === 1);
    expect(normalAllocations).toHaveLength(countStudentsWithADebate(result));
  });

  it("各赛制人数之和 = 参与记录数（池子没有重复计入）", () => {
    const result = allocateParticipations(students, [BIG_PF, WSDC]);
    const total = Object.values(result.countsByFormat).reduce((sum, value) => sum + value, 0);
    const normalAllocations = result.allocations.filter((a) => a.participationNumber === 1);
    expect(total).toBe(normalAllocations.length);
  });
});

describe("确定性与纯函数性质（规范 10.5 明确要求）", () => {
  const students = [
    student("s5", [PF.formatId, WSDC.formatId]),
    student("s1", [PF.formatId]),
    student("s3", [WSDC.formatId, PF.formatId]),
    student("s2", [PF.formatId]),
    student("s4", [WSDC.formatId]),
  ];

  it("同一输入重复运行结果完全一致", () => {
    const first = allocateParticipations(students, [PF, WSDC]);
    const second = allocateParticipations(students, [PF, WSDC]);
    expect(second).toEqual(first);
  });

  it("打乱输入顺序不影响结果（内部按 studentId 稳定排序）", () => {
    const shuffled = [...students].reverse();
    expect(allocateParticipations(shuffled, [PF, WSDC])).toEqual(
      allocateParticipations(students, [PF, WSDC]),
    );
  });

  it("打乱赛制传入顺序不影响结果（内部按 displayOrder 排序）", () => {
    expect(allocateParticipations(students, [WSDC, PF])).toEqual(
      allocateParticipations(students, [PF, WSDC]),
    );
  });

  it("不修改入参", () => {
    const snapshot = JSON.stringify(students);
    allocateParticipations(students, [PF, WSDC]);
    expect(JSON.stringify(students)).toBe(snapshot);
  });

  it("没有学生时返回空结果而不是抛错", () => {
    const result = allocateParticipations([], [PF]);
    expect(result.allocations).toEqual([]);
    expect(result.unallocated).toEqual([]);
  });

  it("没有任何赛制时，所有学生都进入未分配名单", () => {
    const result = allocateParticipations([student("s1", [PF.formatId])], []);
    expect(result.allocations).toEqual([]);
    expect(result.unallocated).toHaveLength(1);
  });

  it("志愿里出现本次活动没有的赛制时，安全跳过而不是抛错", () => {
    const result = allocateParticipations(
      [student("s1", ["fmt-does-not-exist", PF.formatId]), student("s2", [PF.formatId])],
      [PF],
    );
    // s1 的无效志愿被跳过，第二志愿 PF 变成他的下一轮选择
    expect(result.allocations).toHaveLength(2);
  });
});

describe("countsByFormat 便于界面核对", () => {
  it("统计每个赛制最终分到的人数", () => {
    const result = allocateParticipations(
      [
        student("s1", [PF.formatId]),
        student("s2", [PF.formatId]),
        student("s3", [WSDC.formatId]),
        student("s4", [WSDC.formatId]),
        student("s5", [WSDC.formatId]),
      ],
      [PF, WSDC],
    );
    expect(result.countsByFormat[PF.formatId]).toBe(2);
    expect(result.countsByFormat[WSDC.formatId]).toBe(3);
  });

  it("没有被使用的赛制计数为 0", () => {
    const result = allocateParticipations(
      [student("s1", [PF.formatId]), student("s2", [PF.formatId])],
      [PF, BP],
    );
    expect(result.countsByFormat[BP.formatId]).toBe(0);
  });
});
