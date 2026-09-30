// @vitest-environment node
import { describe, expect, it } from "vitest";

import {
  type BallotData,
  type BallotTemplateSchema,
  computeBallotTotals,
  emptyBallotData,
  canSubmitBallot,
  findBallotWarnings,
  validateBallotData,
  validateBallotTemplate,
} from "@/lib/domain/ballot-schema";

/**
 * JWSD 的评分表模板 —— **直接来自产品负责人给的规范**。
 *
 * 与 1v1 那份的关键差别：
 *   - 分数是**按发言者个人**（每人 Style 40 / Content 40 / Strategy 20 = 100）
 *   - **队伍总分 = 三位发言者总分之和**（所谓 `teamFromSpeakers`）
 *   - 论点可带"裁判笔记"、交锋可带三段笔记 → **结构化列表条目**
 */

const PROP_SPEAKERS = ["prop-1", "prop-2", "prop-3"];
const OPP_SPEAKERS = ["opp-1", "opp-2", "opp-3"];
const PROP_TEAM = "team-prop";
const OPP_TEAM = "team-opp";

export const JWSD_TEMPLATE: BallotTemplateSchema = {
  schemaVersion: 1,
  fields: [
    // ---- 发言者计分（规范第 5 节）----
    {
      key: "style",
      label: "表达",
      type: "score",
      scope: "speaker",
      required: true,
      min: 0,
      max: 40,
    },
    {
      key: "content",
      label: "内容",
      type: "score",
      scope: "speaker",
      required: true,
      min: 0,
      max: 40,
    },
    {
      key: "strategy",
      label: "策略",
      type: "score",
      scope: "speaker",
      required: true,
      min: 0,
      max: 20,
    },

    // ---- 每位发言者可选的单独评语（规范第 29、30 节：MVP 里是**可选**）----
    {
      key: "speaker_feedback",
      label: "给这位发言者的一句话",
      type: "text",
      scope: "speaker",
      required: false,
      minLength: 10,
    },

    // ---- 论点：按队伍各一份，每条可带裁判笔记（规范第 17–19 节）----
    {
      key: "main_arguments",
      label: "主要论点",
      type: "list",
      scope: "team",
      required: true,
      minItems: 1,
      maxItems: 5,
      itemLabel: "论点",
      itemFields: [
        // 规范第 19 节：**可选**的裁判笔记
        { key: "judge_note", label: "裁判笔记", required: false },
      ],
    },

    // ---- 交锋：整场一份，每条可带三段笔记（规范第 20–22 节，MVP 里可选）----
    {
      key: "main_clashes",
      label: "主要交锋",
      type: "list",
      scope: "match",
      required: true,
      minItems: 1,
      maxItems: 5,
      itemLabel: "交锋",
      itemFields: [
        { key: "proposition_note", label: "正方主张", required: false },
        { key: "opposition_note", label: "反方主张", required: false },
        { key: "judge_assessment", label: "裁判评估", required: false },
      ],
    },

    // ---- 判决理由（规范第 23、25 节）----
    {
      key: "reason_for_decision",
      label: "判决理由",
      type: "text",
      scope: "match",
      required: true,
      minLength: 100,
    },

    // ---- 裁判信心（规范第 26 节，可选）----
    {
      key: "judge_confidence",
      label: "裁判信心",
      type: "score",
      scope: "match",
      required: false,
      min: 1,
      max: 3,
      options: [
        { value: 3, label: "清晰判决" },
        { value: 2, label: "势均力敌" },
        { value: 1, label: "非常接近" },
      ],
    },

    // ---- 队伍反馈（规范第 27、28 节：**必填**）----
    {
      key: "feedback_strength",
      label: "做得好的地方",
      type: "text",
      scope: "team",
      required: true,
      minLength: 30,
    },
    {
      key: "feedback_improve",
      label: "应该改进的地方",
      type: "text",
      scope: "team",
      required: true,
      minLength: 30,
    },
  ],
  winnerRequired: true,
  reasonForDecisionRequired: true,
  totals: [
    // 每人 100 分（规范第 5、12 节）
    {
      key: "speaker_total",
      label: "个人总分",
      scope: "speaker",
      sumOf: ["style", "content", "strategy"],
      max: 100,
      perSpeaker: true,
    },
    // 队伍总分 = 三位发言者之和（规范第 13 节）
    // 满分 300 = 3 人 × 100；校验只要求它是每人满分的整数倍，
    // 因此将来改成 4 人一队不用改模板定义。
    {
      key: "team_total",
      label: "队伍总分",
      scope: "teamFromSpeakers",
      sumOf: [],
      fromSpeakerTotal: "speaker_total",
      max: 300,
    },
  ],
};

const LONG_RFD =
  "这场比赛最重要的交锋是私立学校是否显著加剧教育不平等。正方解释了私立学校让富裕家庭可以买到更好的师资、" +
  "设施与人脉，从而拉大差距；反方提出家长应有选择权、私立学校也提供奖学金，但没有说明奖学金能在多大程度上" +
  "解决正方指出的结构性问题。在教学质量这一点上反方讲得更好，但正方证明了改善公立学校会影响更多的学生。" +
  "因此我判正方胜。";

function speakerScores(style: number, content: number, strategy: number) {
  return { style, content, strategy };
}

/** 一份填好的、可提交的 JWSD 评分表（规范第 13 节的例子里那组分数）。 */
function filledBallot(): BallotData {
  const data = emptyBallotData();

  data.speakerValues = {
    "prop-1": speakerScores(30, 30, 14),
    "prop-2": speakerScores(29, 29, 14),
    "prop-3": speakerScores(31, 30, 15),
    "opp-1": speakerScores(28, 29, 14),
    "opp-2": speakerScores(29, 30, 14),
    "opp-3": speakerScores(29, 29, 14),
  };

  data.teamValues = {
    [PROP_TEAM]: {
      main_arguments: [
        {
          text: "私立学校让富裕家庭买到更好的师资与设施，加剧教育不平等。",
          judge_note: "反方回应说奖学金能改善入学，但没有证明奖学金规模足够。",
        },
        { text: "改善公立学校能影响远远更多的学生。" },
      ],
      feedback_strength: "正方把「机制—影响—比较」这条线讲得很完整，也比较了两边的受益人数。",
      feedback_improve: "建议在回应奖学金这一点时给出更具体的规模判断，而不是只说「不够」。",
    },
    [OPP_TEAM]: {
      main_arguments: [
        { text: "家长应当保有教育选择权。" },
        { text: "私立学校能提供奖学金，改善部分学生的入学机会。" },
      ],
      feedback_strength: "反方在教学质量与竞争带来的好处这一点上讲得清楚，也有具体例子。",
      feedback_improve: "建议优先回应正方关于结构不平等的论证，而不是重复自己的论点。",
    },
  };

  data.matchValues = {
    main_clashes: [
      {
        text: "私立学校是否显著加剧教育不平等？",
        proposition_note: "私立学校把资源与机会集中在富裕家庭。",
        opposition_note: "家长应有选择权，且部分私立学校提供奖学金。",
        judge_assessment: "正方更好，因为反方没有证明奖学金能实质解决结构性问题。",
      },
      { text: "禁止私立学校会改善公立教育，还是只是减少家长的选择？" },
    ],
    reason_for_decision: LONG_RFD,
    judge_confidence: 2,
  };

  return data;
}

/** 队伍 → 队员。`teamFromSpeakers` 型的总项需要它。 */
const TEAM_MEMBERS = { [PROP_TEAM]: PROP_SPEAKERS, [OPP_TEAM]: OPP_SPEAKERS };

describe("JWSD 模板本身是合法的配置", () => {
  it("模板通过校验", () => {
    const result = validateBallotTemplate(JWSD_TEMPLATE);
    expect(result.valid, JSON.stringify(result.issues)).toBe(true);
  });

  it("每位发言者的满分是 40 + 40 + 20 = 100（规范第 5 节）", () => {
    const categories = JWSD_TEMPLATE.fields.filter(
      (field) => field.type === "score" && field.scope === "speaker",
    );
    const byKey = new Map(categories.map((field) => [field.key, field.max] as const));
    expect(byKey.get("style")).toBe(40);
    expect(byKey.get("content")).toBe(40);
    expect(byKey.get("strategy")).toBe(20);
    expect(40 + 40 + 20).toBe(100);
  });

  it("队伍总分是每人满分的整数倍 —— 校验**不写死 300**，因为人数可变", () => {
    const broken: BallotTemplateSchema = {
      ...JWSD_TEMPLATE,
      totals: [
        ...(JWSD_TEMPLATE.totals ?? []).filter((total) => total.scope !== "teamFromSpeakers"),
        {
          key: "team_total",
          label: "队伍总分",
          scope: "teamFromSpeakers",
          sumOf: [],
          fromSpeakerTotal: "speaker_total",
          max: 250,
        },
      ],
    };
    const result = validateBallotTemplate(broken);
    expect(result.valid).toBe(false);
    expect(result.issues.some((issue) => issue.message.includes("整数倍"))).toBe(true);
  });

  it("队伍总项引用不存在的发言者总项会被拒绝", () => {
    const broken: BallotTemplateSchema = {
      ...JWSD_TEMPLATE,
      totals: [
        ...(JWSD_TEMPLATE.totals ?? []).filter((total) => total.scope !== "teamFromSpeakers"),
        {
          key: "team_total",
          label: "队伍总分",
          scope: "teamFromSpeakers",
          sumOf: [],
          fromSpeakerTotal: "nope",
          max: 300,
        },
      ],
    };
    expect(validateBallotTemplate(broken).valid).toBe(false);
  });
});

describe("个人总分与队伍总分自动计算（规范第 5、12、13、38 节）", () => {
  it("每位发言者的总分 = 表达 + 内容 + 策略", () => {
    const { speakerTotals } = computeBallotTotals(JWSD_TEMPLATE, filledBallot(), {
      teamMembersByTeam: TEAM_MEMBERS,
    });
    expect(speakerTotals["prop-1"]?.speaker_total).toBe(74);
    expect(speakerTotals["prop-2"]?.speaker_total).toBe(72);
    expect(speakerTotals["prop-3"]?.speaker_total).toBe(76);
  });

  it("队伍总分 = 三位发言者之和（规范第 13 节的例子：222 / 216）", () => {
    const { teamTotals } = computeBallotTotals(JWSD_TEMPLATE, filledBallot(), {
      teamMembersByTeam: TEAM_MEMBERS,
    });
    expect(teamTotals[PROP_TEAM]?.team_total).toBe(74 + 72 + 76);
    expect(teamTotals[OPP_TEAM]?.team_total).toBe(71 + 73 + 72);
  });

  it("人数换成 4 人时队伍总分跟着变（正因为如此才不写死 300）", () => {
    const data = filledBallot();
    data.speakerValues["prop-4"] = speakerScores(30, 30, 15);
    const { teamTotals } = computeBallotTotals(JWSD_TEMPLATE, data, {
      teamMembersByTeam: { [PROP_TEAM]: [...PROP_SPEAKERS, "prop-4"], [OPP_TEAM]: OPP_SPEAKERS },
    });
    expect(teamTotals[PROP_TEAM]?.team_total).toBe(74 + 72 + 76 + 75);
  });

  it("没有提供队伍名单时不报错，只是算不出队伍总分", () => {
    const { teamTotals, speakerTotals } = computeBallotTotals(JWSD_TEMPLATE, filledBallot());
    expect(speakerTotals["prop-1"]?.speaker_total).toBe(74);
    expect(teamTotals[PROP_TEAM]).toBeUndefined();
  });
});

describe("结构化列表条目（规范第 19、22 节）", () => {
  it("带裁判笔记的论点通过校验", () => {
    const result = validateBallotData(JWSD_TEMPLATE, filledBallot(), {
      studentIds: [...PROP_SPEAKERS, ...OPP_SPEAKERS],
      teamIds: [PROP_TEAM, OPP_TEAM],
    });
    expect(result.valid, JSON.stringify(result.issues)).toBe(true);
  });

  it("裁判笔记是**可选**的 —— 只写论点正文也能通过", () => {
    const data = filledBallot();
    data.teamValues[PROP_TEAM] = {
      ...data.teamValues[PROP_TEAM],
      main_arguments: [{ text: "只有正文，没有笔记。" }],
    };
    const result = validateBallotData(JWSD_TEMPLATE, data, {
      studentIds: [...PROP_SPEAKERS, ...OPP_SPEAKERS],
      teamIds: [PROP_TEAM, OPP_TEAM],
    });
    expect(result.valid, JSON.stringify(result.issues)).toBe(true);
  });

  it("交锋的三段笔记都留空也可以（MVP 里是可选）", () => {
    const data = filledBallot();
    data.matchValues.main_clashes = [{ text: "只有交锋本身。" }];
    const result = validateBallotData(JWSD_TEMPLATE, data, {
      studentIds: [...PROP_SPEAKERS, ...OPP_SPEAKERS],
      teamIds: [PROP_TEAM, OPP_TEAM],
    });
    expect(result.valid, JSON.stringify(result.issues)).toBe(true);
  });

  it("所有子字段都为空的条目**不算一条**（点了几次「添加」但没写字）", () => {
    const data = filledBallot();
    data.teamValues[PROP_TEAM] = {
      ...data.teamValues[PROP_TEAM],
      // 第 2 条是空的（包括子字段），不应被计数
      main_arguments: [{ text: "真正的论点" }, { text: "", judge_note: "  " }],
    };
    const result = validateBallotData(JWSD_TEMPLATE, data, {
      studentIds: [...PROP_SPEAKERS, ...OPP_SPEAKERS],
      teamIds: [PROP_TEAM, OPP_TEAM],
    });
    expect(result.valid, JSON.stringify(result.issues)).toBe(true);
  });

  it("**必填**子字段没写会报错 —— 只保护必填的那些，可选的照旧放行", () => {
    const strict: BallotTemplateSchema = {
      ...JWSD_TEMPLATE,
      fields: JWSD_TEMPLATE.fields.map((field) =>
        field.key === "main_arguments"
          ? {
              ...field,
              itemFields: [{ key: "judge_note", label: "裁判笔记", required: true }],
            }
          : field,
      ),
    };
    const data = filledBallot();
    data.teamValues[PROP_TEAM] = {
      ...data.teamValues[PROP_TEAM],
      main_arguments: [{ text: "没有笔记的论点" }],
    };
    const result = validateBallotData(strict, data, {
      studentIds: [...PROP_SPEAKERS, ...OPP_SPEAKERS],
      teamIds: [PROP_TEAM, OPP_TEAM],
    });
    expect(result.valid).toBe(false);
    expect(result.issues.some((issue) => issue.message.includes("裁判笔记"))).toBe(true);
  });
});

describe("提交要求（规范第 37 节逐条）", () => {
  const expected = {
    studentIds: [...PROP_SPEAKERS, ...OPP_SPEAKERS],
    teamIds: [PROP_TEAM, OPP_TEAM],
  };

  it("填齐之后可以提交", () => {
    const result = canSubmitBallot(JWSD_TEMPLATE, filledBallot(), {
      winnerTeamId: PROP_TEAM,
      reasonForDecision: LONG_RFD,
      expectedIds: expected,
    });
    expect(result.valid, JSON.stringify(result.issues)).toBe(true);
  });

  it("某位发言者缺分数 → 不能提交", () => {
    const data = filledBallot();
    delete (data.speakerValues["prop-3"] as Record<string, unknown>).strategy;
    const result = validateBallotData(JWSD_TEMPLATE, data, expected);
    expect(result.valid).toBe(false);
    expect(result.issues.map((issue) => issue.message).join("")).toContain("prop-3");
  });

  it("缺交锋 → 不能提交", () => {
    const data = filledBallot();
    data.matchValues.main_clashes = [];
    expect(validateBallotData(JWSD_TEMPLATE, data, expected).valid).toBe(false);
  });

  it("缺反方的改进反馈 → 不能提交", () => {
    const data = filledBallot();
    delete (data.teamValues[OPP_TEAM] as Record<string, unknown>).feedback_improve;
    expect(validateBallotData(JWSD_TEMPLATE, data, expected).valid).toBe(false);
  });

  it("分数超出上限（策略 21 分）→ 不能提交", () => {
    const data = filledBallot();
    data.speakerValues["prop-1"] = { ...data.speakerValues["prop-1"], strategy: 21 };
    const result = validateBallotData(JWSD_TEMPLATE, data, expected);
    expect(result.issues.some((issue) => issue.message.includes("高于最大值"))).toBe(true);
  });

  it("裁判信心与个人评语都是**可选**的（规范第 37 节）", () => {
    const data = filledBallot();
    delete (data.matchValues as Record<string, unknown>).judge_confidence;
    // 完全没有 speaker_feedback
    const result = validateBallotData(JWSD_TEMPLATE, data, expected);
    expect(result.valid, JSON.stringify(result.issues)).toBe(true);
  });
});

describe("软警告：队伍总分与胜方明显不符（规范第 15 节）", () => {
  it("胜方总分明显偏低 → 有警告，但**仍然可以提交**", () => {
    const data = filledBallot();
    // 把正方压到明显低于反方
    data.speakerValues["prop-1"] = speakerScores(20, 20, 10);
    data.speakerValues["prop-2"] = speakerScores(20, 20, 10);
    data.speakerValues["prop-3"] = speakerScores(20, 20, 10);

    const warnings = findBallotWarnings(JWSD_TEMPLATE, data, {
      winnerTeamId: PROP_TEAM,
      reasonForDecision: LONG_RFD,
      teamMembersByTeam: TEAM_MEMBERS,
    });
    expect(warnings.some((warning) => warning.code === "winner_score_mismatch")).toBe(true);

    const submission = canSubmitBallot(JWSD_TEMPLATE, data, {
      winnerTeamId: PROP_TEAM,
      reasonForDecision: LONG_RFD,
      expectedIds: {
        studentIds: [...PROP_SPEAKERS, ...OPP_SPEAKERS],
        teamIds: [PROP_TEAM, OPP_TEAM],
      },
    });
    expect(submission.valid, JSON.stringify(submission.issues)).toBe(true);
  });

  it("总分接近时**不**报警", () => {
    const warnings = findBallotWarnings(JWSD_TEMPLATE, filledBallot(), {
      winnerTeamId: PROP_TEAM,
      reasonForDecision: LONG_RFD,
      teamMembersByTeam: TEAM_MEMBERS,
    });
    expect(warnings.some((warning) => warning.code === "winner_score_mismatch")).toBe(false);
  });
});

/**
 * 规范第 38 节要求校验区间，第 39 节又给了"日常建议范围 60–80"。
 *
 * 这两者是**不同性质**的：区间（0–40 / 0–20）是**硬**校验，
 * 而 60–80 是**建议**，规范明说"只有在确实异常的情况下才用范围外的分数"。
 * 因此后者**不能**做成拒绝提交的条件 —— 如果硬性限制在 60–80，
 * 一位打了 85 分的裁判会无法提交，而那与规范相反。
 */
describe("分数区间：硬校验与建议范围要分清（规范第 38、39 节）", () => {
  it("分项超出硬区间 → 不能提交", () => {
    const data = filledBallot();
    data.speakerValues["prop-1"] = speakerScores(41, 30, 14);
    expect(
      validateBallotData(JWSD_TEMPLATE, data, {
        studentIds: [...PROP_SPEAKERS, ...OPP_SPEAKERS],
        teamIds: [PROP_TEAM, OPP_TEAM],
      }).valid,
    ).toBe(false);
  });

  it("总分低于建议范围（例如 55 分）**仍然可以提交** —— 建议范围不是硬限制", () => {
    const data = filledBallot();
    // 每人约 55 分
    for (const studentId of PROP_SPEAKERS) {
      data.speakerValues[studentId] = speakerScores(22, 22, 11);
    }
    const total = computeBallotTotals(JWSD_TEMPLATE, data, { teamMembersByTeam: TEAM_MEMBERS })
      .speakerTotals["prop-1"]?.speaker_total;
    expect(total).toBe(55);

    const result = canSubmitBallot(JWSD_TEMPLATE, data, {
      winnerTeamId: PROP_TEAM,
      reasonForDecision: LONG_RFD,
      expectedIds: {
        studentIds: [...PROP_SPEAKERS, ...OPP_SPEAKERS],
        teamIds: [PROP_TEAM, OPP_TEAM],
      },
    });
    expect(result.valid, JSON.stringify(result.issues)).toBe(true);
  });

  it("总分高于建议范围（例如 85 分）**仍然可以提交**", () => {
    const data = filledBallot();
    data.speakerValues["prop-1"] = speakerScores(35, 34, 16);
    const total = computeBallotTotals(JWSD_TEMPLATE, data, { teamMembersByTeam: TEAM_MEMBERS })
      .speakerTotals["prop-1"]?.speaker_total;
    expect(total).toBe(85);

    const result = canSubmitBallot(JWSD_TEMPLATE, data, {
      winnerTeamId: PROP_TEAM,
      reasonForDecision: LONG_RFD,
      expectedIds: {
        studentIds: [...PROP_SPEAKERS, ...OPP_SPEAKERS],
        teamIds: [PROP_TEAM, OPP_TEAM],
      },
    });
    expect(result.valid, JSON.stringify(result.issues)).toBe(true);
  });
});
