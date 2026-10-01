// @vitest-environment node
import { describe, expect, it } from "vitest";

import { reviewBallot, type BallotReviewInput } from "@/lib/domain/ballot-review";
import type { BallotTemplateSchema } from "@/lib/domain/ballot-schema";

/**
 * 提交前的自查（规范 §9.3 第 6 条与 "Validate arithmetic and required fields
 * before review"）。
 *
 * ⚠️ 这些用例只覆盖**必填**项：服务端已经会做完整校验，
 * 但那份校验只在点下"提交"之后才说话 —— 而填一份表要十几分钟。
 */

const SCHEMA: BallotTemplateSchema = {
  schemaVersion: 1,
  winnerRequired: true,
  reasonForDecisionRequired: true,
  fields: [
    {
      key: "content",
      label: "内容",
      type: "score",
      scope: "speaker",
      required: true,
      min: 20,
      max: 30,
    },
    {
      key: "style",
      label: "表达",
      type: "score",
      scope: "speaker",
      required: false,
      min: 20,
      max: 30,
    },
    // JWSD 式的"只对第 4 位生效"的字段
    {
      key: "reply_score",
      label: "回复分",
      type: "score",
      scope: "speaker",
      required: true,
      min: 20,
      max: 30,
      speakerPositions: [4],
    },
    {
      key: "feedback_strength",
      label: "做得好的地方",
      type: "text",
      scope: "team",
      required: true,
      minLength: 30,
    },
    {
      key: "arguments",
      label: "论点",
      type: "list",
      scope: "team",
      required: true,
      minItems: 1,
      maxItems: 5,
    },
    {
      key: "reason_for_decision",
      label: "判决理由",
      type: "text",
      scope: "match",
      required: true,
      minLength: 100,
    },
  ],
};

const SPEAKERS = [
  { studentId: "s1", displayName: "张三", speakerPosition: 1 },
  { studentId: "s4", displayName: "李四", speakerPosition: 4 },
];

const TEAMS = [
  { teamId: "t1", teamLabel: "队伍 1", position: "PROP" },
  { teamId: "t2", teamLabel: "队伍 2", position: "OPP" },
];

/** 一份什么都填好的输入；各用例只改一处。 */
function input(overrides: Partial<BallotReviewInput> = {}): BallotReviewInput {
  return {
    schema: SCHEMA,
    speakerValues: {
      // 张三只需要 content；李四需要 content + reply_score（第 4 位）
      s1: { content: 25 },
      s4: { content: 24, reply_score: 23 },
    },
    otherValues: {
      "t1|feedback_strength": "第一段论证清楚。",
      "t2|feedback_strength": "结尾要收拢。",
      "t1|arguments": ["公共论坛应设门槛"],
      "t2|arguments": ["反方举证不足"],
      reason_for_decision: "我方在交锋上占优，对方时间分配有问题。",
    },
    speakers: SPEAKERS,
    teams: TEAMS,
    winnerTeamId: "t1",
    reasonForDecision: "我方在交锋上占优，对方时间分配有问题。",
    ...overrides,
  };
}

describe("填齐了就不该报缺", () => {
  it("完整的一份表 → missing 为空，并给出胜方与理由字数", () => {
    const result = reviewBallot(input());
    expect(result.missing).toEqual([]);
    expect(result.winnerLabel).toBe("队伍 1");
    expect(result.reasonLength).toBeGreaterThan(0);
  });

  it("选填项（表达）留空不算缺", () => {
    expect(reviewBallot(input()).missing).not.toContain("张三 · 表达");
  });

  it("**不适用的**字段不算缺：第 4 位的回复分与第 1 位无关", () => {
    const result = reviewBallot(
      input({ speakerValues: { s1: { content: 25 }, s4: { content: 24, reply_score: 23 } } }),
    );
    expect(result.missing).toEqual([]);
    // 张三（第 1 位）不该被要求填"回复分"
    expect(result.missing.some((item) => item.includes("张三") && item.includes("回复分"))).toBe(
      false,
    );
  });
});

describe("缺什么就说什么（不能只说「还不能提交」）", () => {
  it("没选胜方", () => {
    expect(reviewBallot(input({ winnerTeamId: null })).missing).toContain("胜方");
    expect(reviewBallot(input({ winnerTeamId: null })).winnerLabel).toBeNull();
  });

  it("没写判决理由", () => {
    expect(reviewBallot(input({ reasonForDecision: "   " })).missing).toContain("判决理由");
  });

  it("某位学生的一项必填分没打 —— 说清楚是**谁**的**哪一项**", () => {
    const result = reviewBallot(
      input({ speakerValues: { s1: {}, s4: { content: 24, reply_score: 23 } } }),
    );
    expect(result.missing).toContain("张三 · 内容");
  });

  it("某队的必填反馈没写", () => {
    const result = reviewBallot(
      input({
        otherValues: {
          "t1|feedback_strength": "第一段论证清楚。",
          "t1|arguments": ["公共论坛应设门槛"],
        },
      }),
    );
    expect(result.missing).toContain("队伍 2 · 做得好的地方");
    expect(result.missing).toContain("队伍 2 · 论点");
  });

  it("整场的必填文字没写", () => {
    const result = reviewBallot(
      input({
        otherValues: {
          "t1|feedback_strength": "a",
          "t2|feedback_strength": "b",
          "t1|arguments": ["x"],
          "t2|arguments": ["y"],
        },
      }),
    );
    expect(result.missing).toContain("判决理由");
  });

  it("列表字段按**条数**判断：空数组、或只有空条目，都算缺", () => {
    const empty = reviewBallot(
      input({ otherValues: { ...input().otherValues, "t1|arguments": [] } }),
    );
    expect(empty.missing).toContain("队伍 1 · 论点");

    const blank = reviewBallot(
      input({ otherValues: { ...input().otherValues, "t1|arguments": ["", "  "] } }),
    );
    expect(blank.missing).toContain("队伍 1 · 论点");
  });
});

describe("不该把软阈值当硬要求", () => {
  /**
   * ⚠️ 规范明确：`minLength` 是 "Recommended minimum"，而且
   * "Do **not** block submission solely based on writing quality"。
   * 因此字数不足**不能**进 missing —— 那会挡住提交，和规范相反。
   */
  it("判决理由字数不到建议值，不算「缺」，只报字数", () => {
    const result = reviewBallot(input({ reasonForDecision: "太短。" }));
    expect(result.missing).not.toContain("判决理由");
    expect(result.reasonLength).toBe(3);
  });
});
