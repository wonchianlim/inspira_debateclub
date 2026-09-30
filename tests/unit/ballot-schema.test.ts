// @vitest-environment node
import { describe, expect, it } from "vitest";

import {
  type BallotData,
  type BallotTemplateSchema,
  canSubmitBallot,
  emptyBallotData,
  validateBallotData,
  validateBallotTemplate,
} from "@/lib/domain/ballot-schema";

/**
 * 评分表模板与数据校验（规范第 6.6 节）。
 *
 * ⚠️ 测试里用的字段（`content` / `speaker_points` 之类）**只是举例**，
 * 用来验证校验逻辑本身。**它们不是对五种赛制该打哪些分的断言** ——
 * 那属于辩论领域的数据，由产品负责人以模板配置的形式给出。
 */

const SPEAKER_SCHEMA: BallotTemplateSchema = {
  schemaVersion: 1,
  fields: [
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
      key: "style",
      label: "表达",
      type: "score",
      scope: "speaker",
      required: true,
      min: 0,
      max: 40,
    },
    { key: "note", label: "评语", type: "text", scope: "speaker", required: false },
  ],
  winnerRequired: true,
  reasonForDecisionRequired: true,
};

function data(overrides: Partial<BallotData> = {}): BallotData {
  return { ...emptyBallotData(), ...overrides };
}

describe("模板 schema 本身的校验（配置错了要在保存时拦住）", () => {
  it("一个正常模板通过", () => {
    expect(validateBallotTemplate(SPEAKER_SCHEMA).valid).toBe(true);
  });

  it("没有字段的模板被拒绝", () => {
    const result = validateBallotTemplate({ ...SPEAKER_SCHEMA, fields: [] });
    expect(result.valid).toBe(false);
    expect(result.issues[0]?.message).toContain("至少要有一个字段");
  });

  it("字段键重复被拒绝", () => {
    const result = validateBallotTemplate({
      ...SPEAKER_SCHEMA,
      fields: [
        {
          key: "content",
          label: "内容",
          type: "score",
          scope: "speaker",
          required: true,
          min: 0,
          max: 40,
        },
        { key: "content", label: "另一个内容", type: "text", scope: "match", required: false },
      ],
    });
    expect(result.valid).toBe(false);
    expect(result.issues.some((issue) => issue.message.includes("重复"))).toBe(true);
  });

  it("字段键格式不合法被拒绝（大写、连字符、数字开头）", () => {
    for (const badKey of ["Content", "speaker-points", "1speaker", ""]) {
      const result = validateBallotTemplate({
        ...SPEAKER_SCHEMA,
        fields: [{ key: badKey, label: "x", type: "text", scope: "match", required: false }],
      });
      expect(result.valid, `键 "${badKey}" 应当被拒绝`).toBe(false);
    }
  });

  it("缺少显示名称被拒绝", () => {
    const result = validateBallotTemplate({
      ...SPEAKER_SCHEMA,
      fields: [{ key: "content", label: "  ", type: "text", scope: "match", required: false }],
    });
    expect(result.valid).toBe(false);
    expect(result.issues.some((issue) => issue.message.includes("显示名称"))).toBe(true);
  });

  /**
   * 这一条是整套设计的核心：
   * **分数区间必须由配置模板的人给出，系统不能替他决定。**
   */
  it("分数字段没有给出区间 → 被拒绝，且说明这是各赛制的评分区间", () => {
    const result = validateBallotTemplate({
      ...SPEAKER_SCHEMA,
      fields: [
        { key: "speaker_points", label: "演讲分", type: "score", scope: "speaker", required: true },
      ],
    });
    expect(result.valid).toBe(false);
    expect(result.issues[0]?.message).toContain("不能由系统替你决定");
  });

  it("分数区间反了（min > max）被拒绝", () => {
    const result = validateBallotTemplate({
      ...SPEAKER_SCHEMA,
      fields: [
        {
          key: "s",
          label: "分",
          type: "score",
          scope: "speaker",
          required: true,
          min: 100,
          max: 0,
        },
      ],
    });
    expect(result.valid).toBe(false);
    expect(result.issues[0]?.message).toContain("最小值大于最大值");
  });

  it("无法识别的类型/范围被拒绝", () => {
    const result = validateBallotTemplate({
      ...SPEAKER_SCHEMA,
      // 故意传入非法值，模拟界面被绕过
      fields: [
        {
          key: "x",
          label: "x",
          type: "percent" as never,
          scope: "galaxy" as never,
          required: false,
        },
      ],
    });
    expect(result.valid).toBe(false);
    expect(result.issues).toHaveLength(2);
  });
});

describe("按模板校验填好的数据", () => {
  it("必填项都填了 → 通过", () => {
    const result = validateBallotData(
      SPEAKER_SCHEMA,
      data({
        speakerValues: {
          s1: { content: 30, style: 28 },
          s2: { content: 25, style: 26 },
        },
      }),
      { studentIds: ["s1", "s2"] },
    );
    expect(result.valid, JSON.stringify(result.issues)).toBe(true);
  });

  it("必填的整场字段没填 → 不通过", () => {
    const schema: BallotTemplateSchema = {
      ...SPEAKER_SCHEMA,
      fields: [
        { key: "motion_note", label: "对辩题的看法", type: "text", scope: "match", required: true },
      ],
    };
    const result = validateBallotData(schema, data());
    expect(result.valid).toBe(false);
    expect(result.issues[0]?.message).toContain("必须填写");
  });

  it("分数超出区间 → 分别报出低于最小值与高于最大值", () => {
    const tooLow = validateBallotData(
      SPEAKER_SCHEMA,
      data({ speakerValues: { s1: { content: -1, style: 20 } } }),
    );
    expect(tooLow.valid).toBe(false);
    expect(tooLow.issues.some((issue) => issue.message.includes("低于最小值"))).toBe(true);

    const tooHigh = validateBallotData(
      SPEAKER_SCHEMA,
      data({ speakerValues: { s1: { content: 999, style: 20 } } }),
    );
    expect(tooHigh.issues.some((issue) => issue.message.includes("高于最大值"))).toBe(true);
  });

  it("边界值**恰好等于**最小值或最大值 → 通过（包含边界）", () => {
    const result = validateBallotData(
      SPEAKER_SCHEMA,
      data({ speakerValues: { s1: { content: 0, style: 40 } } }),
      { studentIds: ["s1"] },
    );
    expect(result.valid, JSON.stringify(result.issues)).toBe(true);
  });

  it("分数字段填了文字 → 不通过", () => {
    const result = validateBallotData(
      SPEAKER_SCHEMA,
      data({ speakerValues: { s1: { content: "不错", style: 20 } } }),
    );
    expect(result.issues.some((issue) => issue.message.includes("必须是数字"))).toBe(true);
  });

  it("布尔字段填了别的东西 → 不通过", () => {
    const schema: BallotTemplateSchema = {
      ...SPEAKER_SCHEMA,
      fields: [{ key: "poi", label: "有质询", type: "boolean", scope: "match", required: false }],
    };
    const result = validateBallotData(schema, data({ matchValues: { poi: "是" } }));
    expect(result.issues.some((issue) => issue.message.includes("必须是「是/否」"))).toBe(true);
  });

  /**
   * ⚠️ 这一条很重要：只校验"已填的项"是不够的 ——
   * 那样一个裁判可以**一个人都不打**就提交。
   */
  it("漏打某位学生 → 不通过（只校验已填项是不够的）", () => {
    const result = validateBallotData(
      SPEAKER_SCHEMA,
      data({ speakerValues: { s1: { content: 30, style: 28 } } }),
      { studentIds: ["s1", "s2"] },
    );
    expect(result.valid).toBe(false);
    expect(result.issues.some((issue) => issue.message.includes("s2"))).toBe(true);
  });

  it("完全空的数据配上必填项 → 报出每一位应被打分的人", () => {
    const result = validateBallotData(SPEAKER_SCHEMA, data(), { studentIds: ["s1", "s2"] });
    expect(result.valid).toBe(false);
    expect(result.issues.length).toBeGreaterThanOrEqual(2);
  });

  it("非必填项留空 → 通过", () => {
    const result = validateBallotData(
      SPEAKER_SCHEMA,
      data({ speakerValues: { s1: { content: 30, style: 28, note: "" } } }),
      { studentIds: ["s1"] },
    );
    expect(result.valid, JSON.stringify(result.issues)).toBe(true);
  });

  it("按队伍与整场的字段分别落在各自的桶里", () => {
    const schema: BallotTemplateSchema = {
      ...SPEAKER_SCHEMA,
      fields: [
        {
          key: "team_total",
          label: "队伍总分",
          type: "score",
          scope: "team",
          required: true,
          min: 0,
          max: 100,
        },
        { key: "overall", label: "整场评语", type: "text", scope: "match", required: true },
      ],
    };
    const result = validateBallotData(
      schema,
      data({
        teamValues: { t1: { team_total: 75 }, t2: { team_total: 80 } },
        matchValues: { overall: "势均力敌" },
      }),
      { teamIds: ["t1", "t2"] },
    );
    expect(result.valid, JSON.stringify(result.issues)).toBe(true);
  });
});

describe("能否提交（内容层面的判定）", () => {
  const filled = data({
    speakerValues: { s1: { content: 30, style: 28 }, s2: { content: 25, style: 26 } },
  });
  const expected = { studentIds: ["s1", "s2"] };

  it("内容齐全 + 已选胜方 + 有理由 → 可以提交", () => {
    const result = canSubmitBallot(SPEAKER_SCHEMA, filled, {
      winnerTeamId: "t1",
      reasonForDecision: "论证更完整",
      expectedIds: expected,
    });
    expect(result.valid, JSON.stringify(result.issues)).toBe(true);
  });

  it("没选胜方 → 不能提交", () => {
    const result = canSubmitBallot(SPEAKER_SCHEMA, filled, {
      winnerTeamId: null,
      reasonForDecision: "论证更完整",
      expectedIds: expected,
    });
    expect(result.valid).toBe(false);
    expect(result.issues.some((issue) => issue.message.includes("胜方"))).toBe(true);
  });

  it("理由只有空白字符 → 不能提交", () => {
    const result = canSubmitBallot(SPEAKER_SCHEMA, filled, {
      winnerTeamId: "t1",
      reasonForDecision: "   ",
      expectedIds: expected,
    });
    expect(result.valid).toBe(false);
    expect(result.issues.some((issue) => issue.message.includes("判决理由"))).toBe(true);
  });

  it("模板不要求胜方/理由时，这两项可以为空", () => {
    const relaxed: BallotTemplateSchema = {
      ...SPEAKER_SCHEMA,
      winnerRequired: false,
      reasonForDecisionRequired: false,
    };
    const result = canSubmitBallot(relaxed, filled, {
      winnerTeamId: null,
      reasonForDecision: null,
      expectedIds: expected,
    });
    expect(result.valid, JSON.stringify(result.issues)).toBe(true);
  });

  it("内容缺失会被一并报出（不只是报胜方/理由）", () => {
    const result = canSubmitBallot(SPEAKER_SCHEMA, data(), {
      winnerTeamId: null,
      reasonForDecision: null,
      expectedIds: expected,
    });
    expect(result.issues.length).toBeGreaterThan(2);
  });
});

describe("确定性与纯函数性质", () => {
  it("相同输入重复校验结果一致", () => {
    const runs = Array.from({ length: 10 }, () => validateBallotTemplate(SPEAKER_SCHEMA).valid);
    expect(new Set(runs).size).toBe(1);
  });

  it("不修改入参", () => {
    const snapshot = JSON.stringify(SPEAKER_SCHEMA);
    validateBallotTemplate(SPEAKER_SCHEMA);
    expect(JSON.stringify(SPEAKER_SCHEMA)).toBe(snapshot);
  });

  it("emptyBallotData 每次返回新对象（避免调用方共享同一个引用）", () => {
    const a = emptyBallotData();
    const b = emptyBallotData();
    a.matchValues.x = 1;
    expect(b.matchValues.x).toBeUndefined();
  });
});
