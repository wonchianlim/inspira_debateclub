// @vitest-environment node
import { describe, expect, it } from "vitest";

import {
  type BallotData,
  type BallotTemplateSchema,
  canSubmitBallot,
  computeBallotTotals,
  emptyBallotData,
  findBallotWarnings,
  validateBallotData,
  validateBallotTemplate,
} from "@/lib/domain/ballot-schema";

/**
 * 即兴辩论（1v1）的评分表模板 —— **直接来自产品负责人给的规范**。
 *
 * 这份文件的作用不只是测代码：它把那份规范变成**可执行的断言**。
 * 如果将来有人改错了满分、漏了一个维度、或者把"总分自动计算"改成了手填，
 * 这里的测试会失败。
 *
 * 映射关系（规范 → 本项目的共享表）：
 *   - 规范的"正方/反方" → `scope: "team"` 的字段（每支队伍各一份取值）
 *   - 规范的"Clashes"（不按方） → `scope: "match"` 的字段
 *   - 规范的 6 个 Ballot 部分 → 列表字段 + 文字字段
 *   - 规范的"TOTAL 自动计算" → `totals`（**不存数据库**，读取时计算）
 */

import { EXTEMP_TEMPLATE } from "@/lib/domain/official-templates";

const PROP = "team-prop";
const OPP = "team-opp";

/** 一份填好的、可用于提交的即兴辩论评分表。 */
function filledBallot(overrides: Partial<BallotData> = {}): BallotData {
  return {
    ...emptyBallotData(),
    teamValues: {
      [PROP]: {
        // ⚠️ 论点是**按队伍**的列表：正方一份、反方一份。
        // 初版把它放进了 matchValues（整场），测试立刻报"在 team-prop 上没有填写"。
        main_arguments: [
          "作业大多是重复练习，同样的效果可以在课堂内完成。",
          "作业挤占睡眠时间，对身心健康的损害超过学业收益。",
          "不是所有学生都有相同的家庭支持，作业会放大不平等。",
        ],
        argumentation: 7,
        engagement: 6,
        analysis_adaptability: 5,
        delivery: 3,
        structure_strategy: 2,
        feedback_strength: "正方对「课后作业重复且无法带来额外收益」的论证最扎实，机制讲得清楚。",
        feedback_improve: "建议把影响比较做得更直接，明确说明为什么压力比学业收益更重要。",
      },
      [OPP]: {
        main_arguments: [
          "作业培养自律与时间管理能力，这是课堂内难以替代的。",
          "适度的重复练习是掌握技能的必经过程。",
        ],
        argumentation: 6,
        engagement: 5,
        analysis_adaptability: 4,
        delivery: 3,
        structure_strategy: 1,
        feedback_strength:
          "反方在纪律养成这一点上给出了具体例子，说明得比较清楚，也回应了正方的部分质疑。",
        feedback_improve: "建议回应正方关于睡眠与身心健康的比较，而不是重复自己的论点。",
      },
    },
    matchValues: {
      main_clashes: [
        "作业带来的学业收益是否足以正当化它对睡眠与自由时间的挤占？",
        "课堂时间能否替代作业达到同样的练习量？",
      ],
      reason_for_decision:
        "这场比赛最重要的交锋是「作业的学业收益能否正当化它带来的压力」。正方解释了为什么大量作业只是重复劳动，并说明同样的练习可以在课堂内完成；反方提出作业培养自律，但没有解释为什么必须是作业本身才能达到这个效果。正方对睡眠与身心健康的影响讲得更具体，也比较了两者的重要性。因此我判正方胜。",
      judge_confidence: 3,
    },
    ...overrides,
  };
}

describe("即兴辩论模板本身是合法的配置", () => {
  it("模板通过校验（满分、总项、列表范围都对）", () => {
    const result = validateBallotTemplate(EXTEMP_TEMPLATE);
    expect(result.valid, JSON.stringify(result.issues)).toBe(true);
  });

  it("五个维度满分之和等于 30（规范第 4 节）", () => {
    const categories = EXTEMP_TEMPLATE.fields.filter(
      (field) => field.type === "score" && field.scope === "team",
    );
    const sum = categories.reduce((total, field) => total + (field.max ?? 0), 0);
    expect(sum).toBe(30);
  });

  it("各个维度的满分与规范逐条一致", () => {
    const byKey = new Map(
      EXTEMP_TEMPLATE.fields.filter((f) => f.scope === "team").map((f) => [f.key, f.max] as const),
    );
    expect(byKey.get("argumentation")).toBe(10);
    expect(byKey.get("engagement")).toBe(8);
    expect(byKey.get("analysis_adaptability")).toBe(6);
    expect(byKey.get("delivery")).toBe(4);
    expect(byKey.get("structure_strategy")).toBe(2);
  });

  it("总项的满分与各分项之和一致", () => {
    const total = EXTEMP_TEMPLATE.totals?.[0];
    expect(total?.max).toBe(30);
  });

  it("把总项满分改错会被模板校验拒绝（防止界面显示 /30 而其实只能打 28）", () => {
    const broken: BallotTemplateSchema = {
      ...EXTEMP_TEMPLATE,
      totals: [
        {
          ...(EXTEMP_TEMPLATE.totals?.[0] as NonNullable<typeof EXTEMP_TEMPLATE.totals>[number]),
          max: 28,
        },
      ],
    };
    const result = validateBallotTemplate(broken);
    expect(result.valid).toBe(false);
    expect(result.issues.some((issue) => issue.message.includes("两者必须一致"))).toBe(true);
  });

  it("列表字段不能按学生（规范里的论点与交锋都是按方/整场）", () => {
    const broken: BallotTemplateSchema = {
      ...EXTEMP_TEMPLATE,
      fields: EXTEMP_TEMPLATE.fields.map((field) =>
        field.key === "main_arguments" ? { ...field, scope: "speaker" as const } : field,
      ),
    };
    const result = validateBallotTemplate(broken);
    expect(result.valid).toBe(false);
    expect(result.issues.some((issue) => issue.message.includes("不能按学生"))).toBe(true);
  });
});

describe("总分自动计算（规范第 10、40 节：裁判不应手动输入总分）", () => {
  it("正方 7+6+5+3+2 = 23", () => {
    const { teamTotals } = computeBallotTotals(EXTEMP_TEMPLATE, filledBallot());
    expect(teamTotals[PROP]?.total).toBe(23);
  });

  it("反方 6+5+4+3+1 = 19", () => {
    const { teamTotals } = computeBallotTotals(EXTEMP_TEMPLATE, filledBallot());
    expect(teamTotals[OPP]?.total).toBe(19);
  });

  it("总计不会超过 30", () => {
    const maxed = filledBallot({
      teamValues: {
        [PROP]: {
          argumentation: 10,
          engagement: 8,
          analysis_adaptability: 6,
          delivery: 4,
          structure_strategy: 2,
        },
      },
    });
    const { teamTotals } = computeBallotTotals(EXTEMP_TEMPLATE, maxed);
    expect(teamTotals[PROP]?.total).toBe(30);
  });

  it("某一项没填时按已填部分相加（草稿阶段可以看不全）", () => {
    const partial = filledBallot({ teamValues: { [PROP]: { argumentation: 7, engagement: 6 } } });
    const { teamTotals } = computeBallotTotals(EXTEMP_TEMPLATE, partial);
    expect(teamTotals[PROP]?.total).toBe(13);
  });
});

describe("提交要求（规范第 31 节逐条）", () => {
  const expected = { teamIds: [PROP, OPP] };

  it("填齐之后可以提交", () => {
    const result = canSubmitBallot(EXTEMP_TEMPLATE, filledBallot(), {
      winnerTeamId: PROP,
      reasonForDecision: (filledBallot().matchValues.reason_for_decision as string) ?? null,
      expectedIds: expected,
    });
    expect(result.valid, JSON.stringify(result.issues)).toBe(true);
  });

  const requirements: { name: string; patch: Partial<BallotData>; keyword: string }[] = [
    {
      name: "缺正方论点",
      patch: {
        // ⚠️ 论点是**按队伍**的，所以要清空队伍里的那一份，而不是 matchValues
        teamValues: {
          ...filledBallot().teamValues,
          [PROP]: { ...filledBallot().teamValues[PROP], main_arguments: [] },
        },
      },
      keyword: "至少需要",
    },
    {
      name: "缺交锋",
      patch: { matchValues: { ...filledBallot().matchValues, main_clashes: [] } },
      keyword: "至少需要",
    },
    {
      name: "判决理由为空",
      patch: { matchValues: { ...filledBallot().matchValues, reason_for_decision: "" } },
      keyword: "必须填写",
    },
  ];

  for (const requirement of requirements) {
    it(`${requirement.name} → 不能提交`, () => {
      const result = canSubmitBallot(EXTEMP_TEMPLATE, filledBallot(requirement.patch), {
        winnerTeamId: PROP,
        reasonForDecision: "足够长的理由".repeat(30),
        expectedIds: expected,
      });
      expect(result.valid).toBe(false);
      expect(result.issues.map((issue) => issue.message).join("")).toContain(requirement.keyword);
    });
  }

  it("没选胜方 → 不能提交", () => {
    const result = canSubmitBallot(EXTEMP_TEMPLATE, filledBallot(), {
      winnerTeamId: null,
      reasonForDecision: (filledBallot().matchValues.reason_for_decision as string) ?? null,
      expectedIds: expected,
    });
    expect(result.valid).toBe(false);
    expect(result.issues.some((issue) => issue.message.includes("胜方"))).toBe(true);
  });

  it("某一方的反馈没填 → 不能提交", () => {
    const data = filledBallot();
    delete (data.teamValues[OPP] as Record<string, unknown>).feedback_improve;
    const result = canSubmitBallot(EXTEMP_TEMPLATE, data, {
      winnerTeamId: PROP,
      reasonForDecision: (filledBallot().matchValues.reason_for_decision as string) ?? null,
      expectedIds: expected,
    });
    expect(result.valid).toBe(false);
  });

  it("裁判信心是**可选**的（规范第 31 节：Judge Confidence may be optional）", () => {
    const data = filledBallot();
    delete (data.matchValues as Record<string, unknown>).judge_confidence;
    const result = canSubmitBallot(EXTEMP_TEMPLATE, data, {
      winnerTeamId: PROP,
      reasonForDecision: (data.matchValues.reason_for_decision as string) ?? null,
      expectedIds: expected,
    });
    expect(result.valid, JSON.stringify(result.issues)).toBe(true);
  });

  it("分数超出维度满分 → 不能提交", () => {
    const data = filledBallot();
    data.teamValues[PROP] = { ...data.teamValues[PROP], argumentation: 11 };
    const result = validateBallotData(EXTEMP_TEMPLATE, data, expected);
    expect(result.valid).toBe(false);
    expect(result.issues.some((issue) => issue.message.includes("高于最大值"))).toBe(true);
  });

  it("论点超过 5 条 → 不能提交", () => {
    const data = filledBallot();
    data.teamValues[PROP] = {
      ...data.teamValues[PROP],
      main_arguments: ["1", "2", "3", "4", "5", "6"],
    };
    data.teamValues[OPP] = { ...data.teamValues[OPP], main_arguments: ["反方的论点"] };
    const result = validateBallotData(EXTEMP_TEMPLATE, data, expected);
    expect(result.issues.some((issue) => issue.message.includes("最多 5 条"))).toBe(true);
  });

  it("点了「添加」但没写内容的空条目**不算一条论点**", () => {
    const data = filledBallot();
    // 两支队伍都要有（否则会因为缺另一队的论点而失败，测不到本条想测的东西）
    data.teamValues[PROP] = { ...data.teamValues[PROP], main_arguments: ["真正的论点", "  ", ""] };
    data.teamValues[OPP] = { ...data.teamValues[OPP], main_arguments: ["反方的论点"] };
    const result = validateBallotData(EXTEMP_TEMPLATE, data, expected);
    expect(result.valid, JSON.stringify(result.issues)).toBe(true);
  });
});

/**
 * 规范第 13、20 节：这两处都是**软警告**，**明确要求不阻止提交**。
 * 这是本节最重要的断言 —— 如果哪天有人把警告挪进了 issues，
 * 裁判就会被系统强行拦住，而那与规范的要求相反。
 */
describe("软警告：显示但不阻止提交（规范第 13、20 节）", () => {
  it("胜方总分低于对方 → **不能提交**（产品负责人 2026-09-29 明确：所有赛制都不允许 Low Point Win）", () => {
    const data = filledBallot({
      teamValues: {
        [PROP]: {
          ...filledBallot().teamValues[PROP],
          argumentation: 2,
          engagement: 2,
          analysis_adaptability: 1,
          delivery: 1,
          structure_strategy: 0,
        },
        [OPP]: filledBallot().teamValues[OPP],
      },
    });

    const submission = canSubmitBallot(EXTEMP_TEMPLATE, data, {
      winnerTeamId: PROP,
      reasonForDecision: (data.matchValues.reason_for_decision as string) ?? null,
      expectedIds: { teamIds: [PROP, OPP] },
    });

    /*
     * ⚠️ 这一条**修正了**规范第 13 节原来的写法（那里说"不阻止提交"）。
     * 产品负责人后来明确：所有赛制都不允许 Low Point Win，因此这里是硬规则。
     */
    expect(submission.valid).toBe(false);
    expect(
      submission.issues
        .map((issue) => issue.message)
        .join("")
        .toLowerCase(),
    ).toContain("low point win");

    // 也不该再重复一条"可以确认继续"的软警告
    const warnings = findBallotWarnings(EXTEMP_TEMPLATE, data, {
      winnerTeamId: PROP,
      reasonForDecision: (data.matchValues.reason_for_decision as string) ?? null,
    });
    expect(warnings.some((warning) => warning.code === "winner_score_mismatch")).toBe(false);
  });

  it("分数接近时**不**报警（规范举的 24 对 23 属正常）", () => {
    const warnings = findBallotWarnings(EXTEMP_TEMPLATE, filledBallot(), {
      winnerTeamId: PROP,
      reasonForDecision: (filledBallot().matchValues.reason_for_decision as string) ?? null,
    });
    expect(warnings.some((warning) => warning.code === "winner_score_mismatch")).toBe(false);
  });

  it("判决理由过短 → 有警告，但**不阻止提交**（规范：Do not block solely on writing quality）", () => {
    const data = filledBallot();
    const shortReason = "正方更强，因为论证更完整，也比较了重要程度，所以我判正方胜出，理由如上。";
    data.matchValues.reason_for_decision = shortReason;

    const warnings = findBallotWarnings(EXTEMP_TEMPLATE, data, {
      winnerTeamId: PROP,
      reasonForDecision: shortReason,
    });
    expect(warnings.some((warning) => warning.code === "reason_too_brief")).toBe(true);

    /*
     * ⚠️ 关键：短理由**不**进 issues（issues 才是阻止提交的），
     * 而且整份评分表**可以提交**。规范第 20 节："Do not block submission
     * solely based on writing quality."
     */
    const result = validateBallotData(EXTEMP_TEMPLATE, data, { teamIds: [PROP, OPP] });
    expect(result.issues.some((issue) => issue.fieldKey === "reason_for_decision")).toBe(false);

    const submission = canSubmitBallot(EXTEMP_TEMPLATE, data, {
      winnerTeamId: PROP,
      reasonForDecision: shortReason,
      expectedIds: { teamIds: [PROP, OPP] },
    });
    expect(submission.valid, JSON.stringify(submission.issues)).toBe(true);
  });

  it("理由足够长时不报警", () => {
    const data = filledBallot();
    const warnings = findBallotWarnings(EXTEMP_TEMPLATE, data, {
      winnerTeamId: PROP,
      reasonForDecision: (data.matchValues.reason_for_decision as string) ?? null,
    });
    expect(warnings.some((warning) => warning.code === "reason_too_brief")).toBe(false);
  });

  it("反馈过短时也给出提示（同样是软警告）", () => {
    const data = filledBallot();
    data.teamValues[PROP] = { ...data.teamValues[PROP], feedback_strength: "不错。" };
    const warnings = findBallotWarnings(EXTEMP_TEMPLATE, data, {
      winnerTeamId: PROP,
      reasonForDecision: (data.matchValues.reason_for_decision as string) ?? null,
    });
    expect(warnings.some((warning) => warning.code === "feedback_too_brief")).toBe(true);
  });

  it("警告信息是中文且说明「不会阻止提交」（裁判需要知道这一点）", () => {
    const data = filledBallot();
    data.matchValues.reason_for_decision = "太短了。";
    const warnings = findBallotWarnings(EXTEMP_TEMPLATE, data, {
      winnerTeamId: PROP,
      reasonForDecision: "太短了。",
    });
    const warning = warnings.find((entry) => entry.code === "reason_too_brief");
    expect(warning?.message).toContain("不会阻止提交");
  });
});

describe("确定性", () => {
  it("相同输入重复计算总分结果一致", () => {
    const data = filledBallot();
    const runs = Array.from(
      { length: 10 },
      () => computeBallotTotals(EXTEMP_TEMPLATE, data).teamTotals[PROP]?.total,
    );
    expect(new Set(runs).size).toBe(1);
  });

  it("不修改入参", () => {
    const data = filledBallot();
    const snapshot = JSON.stringify(data);
    computeBallotTotals(EXTEMP_TEMPLATE, data);
    findBallotWarnings(EXTEMP_TEMPLATE, data, { winnerTeamId: PROP, reasonForDecision: null });
    expect(JSON.stringify(data)).toBe(snapshot);
  });
});
