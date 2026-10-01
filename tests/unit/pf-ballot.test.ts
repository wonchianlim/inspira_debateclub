// @vitest-environment node
import { describe, expect, it } from "vitest";

import {
  type BallotData,
  canSubmitBallot,
  computeBallotTotals,
  emptyBallotData,
  findBallotWarnings,
  validateBallotData,
  validateBallotTemplate,
} from "@/lib/domain/ballot-schema";
import { PF_TEMPLATE } from "@/lib/domain/official-templates";

/**
 * PF（Public Forum）评分表 —— **来自产品负责人给的规范**。
 *
 * PF 与 1v1 / JWSD 最关键的不同：
 * **"胜方必须分数更高"与"不能平局"是硬规则，不可覆盖**（规范第 3、4、48 节）。
 * 下面专门有一节固定住这个差别 —— 因为同样的现象在另外两个赛制里只是软警告。
 */

const PRO = "team-pro";
const CON = "team-con";
const PRO_SPEAKERS = ["pro-1", "pro-2"];
const CON_SPEAKERS = ["con-1", "con-2"];

const TEAM_MEMBERS = { [PRO]: PRO_SPEAKERS, [CON]: CON_SPEAKERS };
const EXPECTED = {
  studentIds: [...PRO_SPEAKERS, ...CON_SPEAKERS],
  teamIds: [PRO, CON],
};

function speakerScores(total: number) {
  /*
   * 把总分按各维度上限依次填满，**留出的余数不会再超上限**。
   * 初版把余数一股脑塞给满分最小的"交叉质询"（上限 2），
   * 于是 25.5 分算出 crossfire = 5.5，直接被"超出上限"拒绝。
   */
  const maxima: [string, number][] = [
    ["argumentation", 10],
    ["rebuttal", 8],
    ["strategy", 6],
    ["delivery", 4],
    ["crossfire_teamwork", 2],
  ];
  let remaining = total;
  const scores: Record<string, number> = {};
  for (const [key, max] of maxima) {
    const give = Math.min(max, Math.max(0, remaining));
    scores[key] = Math.round(give * 2) / 2;
    remaining -= scores[key] as number;
  }
  return scores;
}

function filledBallot(): BallotData {
  const data = emptyBallotData();
  data.speakerValues = {
    // 规范第 2 节的例子：PRO 25.5 + 26 = 51.5；CON 25 + 25.5 = 50.5
    "pro-1": speakerScores(25.5),
    "pro-2": speakerScores(26),
    "con-1": speakerScores(25),
    "con-2": speakerScores(25.5),
  };
  data.teamValues = {
    [PRO]: {
      main_arguments: [
        { text: "商业化带来更多投资与全球转播。", judge_note: "反方质疑收益是否落到主办社区。" },
      ],
      feedback_strength: "正方在「全球观众规模」这个比较上做得清楚，也比较了两边的影响面。",
      feedback_improve: "建议更直接地回应反方关于低收入球迷被排除的论证，而不是只谈总量。",
    },
    [CON]: {
      main_arguments: [{ text: "商业定价把低收入球迷挡在场馆之外。" }],
      feedback_strength: "反方对场馆准入这一点讲得具体，也给出了可核查的例子与推理。",
      feedback_improve: "建议把运动员负荷这条线讲完，而不是在中途停下，否则很容易被反驳掉。",
    },
  };
  data.matchValues = {
    main_clashes: [
      {
        text: "商业化带来的收益是否足以正当化低收入球迷被排除？",
        pro_note: "投资与转播让更多人能看到比赛。",
        con_note: "现场准入被价格挡住。",
        judge_assessment: "正方在整体触达上更好，反方在场馆准入这个较窄的问题上赢了。",
      },
    ],
    reason_for_decision:
      "这场比赛的核心交锋是商业化带来的额外投资与全球触达，是否超过反方指出的排除与负担。" +
      "正方证明了商业赞助与转播扩大了受众，反方也成功指出部分收益未必落到低收入球迷身上。" +
      "但在规模比较上正方做得更好。反方的运动员负荷论证展开不足，且在反驳中被实质回应。因此我判正方胜。",
    judge_confidence: 2,
  };
  return data;
}

describe("PF 模板是合法的配置", () => {
  it("模板通过校验", () => {
    const result = validateBallotTemplate(PF_TEMPLATE);
    expect(result.valid, JSON.stringify(result.issues)).toBe(true);
  });

  it("五个维度满分之和是 30（规范第 8 节）", () => {
    const byKey = new Map(
      PF_TEMPLATE.fields
        .filter((f) => f.type === "score" && f.scope === "speaker")
        .map((f) => [f.key, f.max] as const),
    );
    expect(byKey.get("argumentation")).toBe(10);
    expect(byKey.get("rebuttal")).toBe(8);
    expect(byKey.get("strategy")).toBe(6);
    expect(byKey.get("delivery")).toBe(4);
    expect(byKey.get("crossfire_teamwork")).toBe(2);
    expect(10 + 8 + 6 + 4 + 2).toBe(30);
  });

  it("所有分数字段都允许半分（规范第 20 节）", () => {
    for (const field of PF_TEMPLATE.fields) {
      if (field.type !== "score" || field.scope !== "speaker") continue;
      expect(field.step, `${field.key} 应当允许半分`).toBe(0.5);
    }
  });

  it("队伍总分满分是 60（规范第 2、21 节）", () => {
    expect(PF_TEMPLATE.totals?.find((t) => t.key === "team_points")?.max).toBe(60);
  });
});

describe("个人总分与队伍总分自动计算（规范第 19、21 节）", () => {
  it("个人总分等于五个维度之和", () => {
    const { speakerTotals } = computeBallotTotals(PF_TEMPLATE, filledBallot(), {
      teamMembersByTeam: TEAM_MEMBERS,
    });
    expect(speakerTotals["pro-1"]?.speaker_total).toBe(25.5);
    expect(speakerTotals["pro-2"]?.speaker_total).toBe(26);
  });

  it("队伍总分 = 两位发言者之和（规范第 2 节的例子：51.5 / 50.5）", () => {
    const { teamTotals } = computeBallotTotals(PF_TEMPLATE, filledBallot(), {
      teamMembersByTeam: TEAM_MEMBERS,
    });
    expect(teamTotals[PRO]?.team_points).toBe(51.5);
    expect(teamTotals[CON]?.team_points).toBe(50.5);
  });

  it("半分被正确累加（不出浮点误差）", () => {
    const data = filledBallot();
    data.speakerValues["pro-1"] = speakerScores(24.5);
    data.speakerValues["pro-2"] = speakerScores(25.5);
    const { teamTotals } = computeBallotTotals(PF_TEMPLATE, data, {
      teamMembersByTeam: TEAM_MEMBERS,
    });
    expect(teamTotals[PRO]?.team_points).toBe(50);
  });
});

/**
 * ⚠️ 这一节是 PF 与另外两个赛制的**关键差别**。
 *
 * 规范第 3 节："This is a hard system rule... There should be no override."
 * 规范第 48 节：这些是 "hard errors and cannot be overridden"。
 */
describe("硬规则：不允许 Low Point Win、不允许平局（规范第 3、4、22、48 节）", () => {
  const submitted = (data: BallotData, winner: string) =>
    canSubmitBallot(PF_TEMPLATE, data, {
      winnerTeamId: winner,
      reasonForDecision: (data.matchValues.reason_for_decision as string) ?? null,
      expectedIds: EXPECTED,
      teamMembersByTeam: TEAM_MEMBERS,
    });

  it("胜方分数更高 → 可以提交", () => {
    const result = submitted(filledBallot(), PRO);
    expect(result.valid, JSON.stringify(result.issues)).toBe(true);
  });

  it("**Low Point Win**：选了分数更低的一方 → 不能提交，且说明不允许低分获胜", () => {
    const result = submitted(filledBallot(), CON);
    expect(result.valid).toBe(false);
    expect(
      result.issues
        .map((issue) => issue.message)
        .join("")
        .toLowerCase(),
    ).toContain("low point win");
  });

  it("低分获胜**不可覆盖** —— 它是 issues（硬错误），不是 warnings", () => {
    const data = filledBallot();
    const result = submitted(data, CON);
    expect(result.issues.length).toBeGreaterThan(0);

    // 软警告里**不应**再重复同一条信息（否则裁判会以为"确认了就能交"）
    const warnings = findBallotWarnings(PF_TEMPLATE, data, {
      winnerTeamId: CON,
      reasonForDecision: (data.matchValues.reason_for_decision as string) ?? null,
      teamMembersByTeam: TEAM_MEMBERS,
    });
    expect(warnings.some((warning) => warning.code === "winner_score_mismatch")).toBe(false);
  });

  it("**平局**：两队总分相同 → 不能提交", () => {
    const data = filledBallot();
    data.speakerValues["con-1"] = speakerScores(25.5);
    data.speakerValues["con-2"] = speakerScores(26);

    const { teamTotals } = computeBallotTotals(PF_TEMPLATE, data, {
      teamMembersByTeam: TEAM_MEMBERS,
    });
    expect(teamTotals[PRO]?.team_points).toBe(teamTotals[CON]?.team_points);

    const result = submitted(data, PRO);
    expect(result.valid).toBe(false);
    expect(
      result.issues
        .map((issue) => issue.message)
        .join("")
        .toLowerCase(),
    ).toContain("same total");
  });

  it("平局时无论选哪一方都不能提交", () => {
    const data = filledBallot();
    data.speakerValues["con-1"] = speakerScores(25.5);
    data.speakerValues["con-2"] = speakerScores(26);
    expect(submitted(data, PRO).valid).toBe(false);
    expect(submitted(data, CON).valid).toBe(false);
  });
});

describe("分数格式：0.5 增量（规范第 48 节规则 3）", () => {
  it("25.5 是合法分数", () => {
    const data = filledBallot();
    data.speakerValues["pro-1"] = { ...data.speakerValues["pro-1"], argumentation: 8.5 };
    expect(validateBallotData(PF_TEMPLATE, data, EXPECTED).valid).toBe(true);
  });

  it("25.3 这种不是 0.5 倍数的分数被拒绝", () => {
    const data = filledBallot();
    data.speakerValues["pro-1"] = { ...data.speakerValues["pro-1"], argumentation: 8.3 };
    const result = validateBallotData(PF_TEMPLATE, data, EXPECTED);
    expect(result.valid).toBe(false);
    expect(result.issues.some((issue) => issue.message.includes("0.5 的整数倍"))).toBe(true);
  });

  it("超出维度上限被拒绝（规范第 48 节规则 2）", () => {
    const data = filledBallot();
    data.speakerValues["pro-1"] = { ...data.speakerValues["pro-1"], argumentation: 10.5 };
    expect(validateBallotData(PF_TEMPLATE, data, EXPECTED).valid).toBe(false);
  });
});

describe("提交要求（规范第 47 节）", () => {
  const run = (data: BallotData) =>
    canSubmitBallot(PF_TEMPLATE, data, {
      winnerTeamId: PRO,
      reasonForDecision: (data.matchValues.reason_for_decision as string) ?? null,
      expectedIds: EXPECTED,
      teamMembersByTeam: TEAM_MEMBERS,
    });

  it("缺一位发言者的分数 → 不能提交", () => {
    const data = filledBallot();
    delete (data.speakerValues["con-2"] as Record<string, unknown>).delivery;
    expect(run(data).valid).toBe(false);
  });

  it("缺交锋 → 不能提交", () => {
    const data = filledBallot();
    data.matchValues.main_clashes = [];
    expect(run(data).valid).toBe(false);
  });

  it("缺反方的改进反馈 → 不能提交", () => {
    const data = filledBallot();
    delete (data.teamValues[CON] as Record<string, unknown>).feedback_improve;
    expect(run(data).valid).toBe(false);
  });

  it("判决理由为空 → 不能提交", () => {
    const data = filledBallot();
    data.matchValues.reason_for_decision = "";
    expect(run(data).valid).toBe(false);
  });

  it("裁判信心与个人评语是**可选**的", () => {
    const data = filledBallot();
    delete (data.matchValues as Record<string, unknown>).judge_confidence;
    expect(run(data).valid, JSON.stringify(run(data).issues)).toBe(true);
  });
});

describe("软警告：极高 / 极低分只是提示（规范第 49 节）", () => {
  it("个人总分高于 29 时给出提示，但**可以继续提交**", () => {
    const data = filledBallot();
    data.speakerValues["pro-1"] = speakerScores(29.5);
    // 保持总分不变以免触发硬规则（这里只是要测警告）
    const warnings = findBallotWarnings(PF_TEMPLATE, data, {
      winnerTeamId: PRO,
      reasonForDecision: (data.matchValues.reason_for_decision as string) ?? null,
      teamMembersByTeam: TEAM_MEMBERS,
    });
    expect(warnings.some((warning) => warning.code === "score_unusually_high")).toBe(true);
    expect(warnings.find((w) => w.code === "score_unusually_high")?.message).toContain(
      "不会阻止提交",
    );
  });

  it("个人总分低于 22 时给出提示", () => {
    const data = filledBallot();
    data.speakerValues["pro-1"] = speakerScores(21.5);
    const warnings = findBallotWarnings(PF_TEMPLATE, data, {
      winnerTeamId: PRO,
      reasonForDecision: (data.matchValues.reason_for_decision as string) ?? null,
      teamMembersByTeam: TEAM_MEMBERS,
    });
    expect(warnings.some((warning) => warning.code === "score_unusually_low")).toBe(true);
  });

  it("正常分数（25–26 区间）不产生极值提示", () => {
    const data = filledBallot();
    const warnings = findBallotWarnings(PF_TEMPLATE, data, {
      winnerTeamId: PRO,
      reasonForDecision: (data.matchValues.reason_for_decision as string) ?? null,
      teamMembersByTeam: TEAM_MEMBERS,
    });
    expect(
      warnings.some((w) => w.code === "score_unusually_high" || w.code === "score_unusually_low"),
    ).toBe(false);
  });
});
