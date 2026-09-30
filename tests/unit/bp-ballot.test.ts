// @vitest-environment node
import { describe, expect, it } from "vitest";

import {
  type BallotData,
  canSubmitBallot,
  computeBallotTotals,
  emptyBallotData,
  validateBallotData,
  validateBallotTemplate,
} from "@/lib/domain/ballot-schema";
import { BP_TEMPLATE } from "@/lib/domain/official-templates";

/**
 * BP（British Parliamentary）—— 来自产品负责人给的规范。
 *
 * BP 与前四种赛制**根本不同**：它没有"胜方"，只有四支队伍的**名次**。
 * 因此下面专门固定住这个差别，以及"排名不得由分数决定"这条规范的明文要求。
 */

const TEAMS = ["og", "oo", "cg", "co"];
const SPEAKERS_BY_TEAM: Record<string, string[]> = {
  og: ["pm", "dpm"],
  oo: ["lo", "dlo"],
  cg: ["mg", "gw"],
  co: ["mo", "ow"],
};
const ALL_SPEAKERS = Object.values(SPEAKERS_BY_TEAM).flat();

const EXPECTED = { studentIds: ALL_SPEAKERS, teamIds: TEAMS };

const LONG_RATIONALE =
  "正关取得第一名，因为他们关于长期政治动员的延伸成为全场最重要的贡献：" +
  "他们不仅说明了动员带来的即时压力，也解释了这如何随时间改变政治行动者的动机。" +
  "反开取得第二名，因为他们在说服与温和选民这一点上给出了最强的比较分析，" +
  "但没有充分回应正关关于持续压力的机制。正开第三：他们的框架有用、也建立了几个相关论点，" +
  "但多数内容的发展程度不如正关的延伸。反关第四：他们关于运动身份的延伸相关，" +
  "但相比之下不那么重要，也没有充分展开，因此无法超过反开或正开。".repeat(1);

function filledBallot(): BallotData {
  const data = emptyBallotData();
  const scores: Record<string, number> = {
    pm: 79,
    dpm: 78,
    lo: 78,
    dlo: 77,
    mg: 77,
    gw: 77,
    mo: 75,
    ow: 76,
  };
  for (const [studentId, score] of Object.entries(scores)) {
    data.speakerValues[studentId] = {
      speaker_score: score,
      speaker_improve: "建议把因果链讲得更完整，不要从主张直接跳到影响。",
    };
  }
  for (const teamId of TEAMS) {
    data.teamValues[teamId] = {
      team_contribution: [{ text: `${teamId} 的主要贡献` }],
    };
  }
  data.matchValues = {
    main_clashes: ["这场辩论真正的问题是：这项政策是否改变了主要利益相关者的动机？"],
    final_ranking: { cg: 1, oo: 2, og: 3, co: 4 },
    ranking_rationale: LONG_RATIONALE,
  };
  return data;
}

describe("BP 模板是合法的配置", () => {
  it("模板通过校验", () => {
    const result = validateBallotTemplate(BP_TEMPLATE);
    expect(result.valid, JSON.stringify(result.issues)).toBe(true);
  });

  it("**没有** winnerRequired —— BP 用排名，不是胜负", () => {
    expect(BP_TEMPLATE.winnerRequired).toBe(false);
  });

  it("**没有任何胜负硬规则** —— 规范第 33 节要求只警告、不阻止", () => {
    expect(BP_TEMPLATE.rules ?? []).toHaveLength(0);
  });

  it("有排名字段，名次是四档", () => {
    const ranking = BP_TEMPLATE.fields.find((field) => field.type === "ranking");
    expect(ranking?.rankLabels).toHaveLength(4);
    expect(ranking?.required).toBe(true);
  });

  it("排名字段必须是「整场」范围（它横跨四支队伍）", () => {
    const ranking = BP_TEMPLATE.fields.find((field) => field.type === "ranking");
    expect(ranking?.scope).toBe("match");
  });

  it("把排名字段改成按队伍会被模板校验拒绝", () => {
    const broken = {
      ...BP_TEMPLATE,
      fields: BP_TEMPLATE.fields.map((field) =>
        field.type === "ranking" ? { ...field, scope: "team" as const } : field,
      ),
    };
    const result = validateBallotTemplate(broken);
    expect(result.valid).toBe(false);
    expect(result.issues.some((issue) => issue.message.includes("整场"))).toBe(true);
  });
});

/**
 * ⚠️ 这一节是 BP 的核心差别。
 * 规范第 32 节："**Never** automatically rank teams using combined speaker scores."
 */
describe("排名：不可重复、必须用满（规范第 4、53、58 节）", () => {
  const run = (data: BallotData) =>
    canSubmitBallot(BP_TEMPLATE, data, {
      winnerTeamId: null,
      reasonForDecision: (data.matchValues.ranking_rationale as string) ?? null,
      expectedIds: EXPECTED,
      teamMembersByTeam: SPEAKERS_BY_TEAM,
    });

  it("四队各一个名次 → 可以提交", () => {
    const result = run(filledBallot());
    expect(result.valid, JSON.stringify(result.issues)).toBe(true);
  });

  it("名次重复（两队并列第一）→ 不能提交", () => {
    const data = filledBallot();
    data.matchValues.final_ranking = { cg: 1, oo: 1, og: 3, co: 4 };
    const result = run(data);
    expect(result.valid).toBe(false);
    expect(result.issues.map((issue) => issue.message).join("")).toContain("重复");
  });

  it("名次跳号（1、2、4、4）→ 不能提交", () => {
    const data = filledBallot();
    data.matchValues.final_ranking = { cg: 1, oo: 2, og: 4, co: 4 };
    const result = run(data);
    expect(result.valid).toBe(false);
    expect(result.issues.map((issue) => issue.message).join("")).toContain("必须恰好用到");
  });

  it("有队伍没有名次 → 不能提交，并说明还差几支", () => {
    const data = filledBallot();
    data.matchValues.final_ranking = { cg: 1, oo: 2 };
    const result = run(data);
    expect(result.valid).toBe(false);
    expect(result.issues.map((issue) => issue.message).join("")).toContain("还没有给这些队伍排名");
  });

  it("四队都排名但分数明显倒挂 → **仍然可以提交**（规范第 33 节：只警告不阻止）", () => {
    const data = filledBallot();
    // 第一名是分数最低的 co（⚠️ 键必须是**队伍** id，不能写成发言者）
    data.matchValues.final_ranking = { co: 1, cg: 2, oo: 3, og: 4 };
    data.speakerValues.mo = { ...data.speakerValues.mo, speaker_score: 62 };
    data.speakerValues.ow = { ...data.speakerValues.ow, speaker_score: 61 };

    const result = run(data);
    /*
     * ⚠️ 这是刻意的：BP 的排名本来就不该由分数决定。
     * 产品负责人曾说过"BP 不允许 low point wins"，但 BP 规范第 33 节
     * 明确写 "This is a warning only. Do not automatically block submission."
     * 且 BP 没有"胜方"字段。我按规范实现为**不阻止**，并已在报告里提出这处矛盾。
     */
    expect(result.valid, JSON.stringify(result.issues)).toBe(true);
  });
});

describe("发言者分数的硬性区间 60–85（规范第 18、58 节）", () => {
  const run = (data: BallotData) =>
    canSubmitBallot(BP_TEMPLATE, data, {
      winnerTeamId: null,
      reasonForDecision: (data.matchValues.ranking_rationale as string) ?? null,
      expectedIds: EXPECTED,
      teamMembersByTeam: SPEAKERS_BY_TEAM,
    });

  it("85 分可以提交（硬性上界）", () => {
    const data = filledBallot();
    data.speakerValues.pm = { ...data.speakerValues.pm, speaker_score: 85 };
    expect(run(data).valid, JSON.stringify(run(data).issues)).toBe(true);
  });

  it("60 分可以提交（硬性下界）", () => {
    const data = filledBallot();
    data.speakerValues.pm = { ...data.speakerValues.pm, speaker_score: 60 };
    expect(run(data).valid, JSON.stringify(run(data).issues)).toBe(true);
  });

  it("59 分被拒绝", () => {
    const data = filledBallot();
    data.speakerValues.pm = { ...data.speakerValues.pm, speaker_score: 59 };
    const result = run(data);
    expect(result.valid).toBe(false);
    expect(result.issues.map((issue) => issue.message).join("")).toContain("59");
  });

  it("86 分被拒绝", () => {
    const data = filledBallot();
    data.speakerValues.pm = { ...data.speakerValues.pm, speaker_score: 86 };
    expect(run(data).valid).toBe(false);
  });

  it("75.5 这种半分被拒绝（规范第 18 节：只用整数）", () => {
    const data = filledBallot();
    data.speakerValues.pm = { ...data.speakerValues.pm, speaker_score: 75.5 };
    const result = run(data);
    expect(result.valid).toBe(false);
    expect(result.issues.map((issue) => issue.message).join("")).toContain("整数");
  });
});

describe("提交要求（规范第 57 节）", () => {
  const run = (data: BallotData) =>
    canSubmitBallot(BP_TEMPLATE, data, {
      winnerTeamId: null,
      reasonForDecision: (data.matchValues.ranking_rationale as string) ?? null,
      expectedIds: EXPECTED,
      teamMembersByTeam: SPEAKERS_BY_TEAM,
    });

  it("八位发言者都要有分数", () => {
    const data = filledBallot();
    delete (data.speakerValues.ow as Record<string, unknown>).speaker_score;
    expect(run(data).valid).toBe(false);
  });

  it("每位发言者的**改进建议**必填（规范第 57 节）", () => {
    const data = filledBallot();
    delete (data.speakerValues.mg as Record<string, unknown>).speaker_improve;
    expect(run(data).valid).toBe(false);
  });

  it("「做得好的地方」是**可选**的（规范第 57 节）", () => {
    const data = filledBallot();
    for (const studentId of ALL_SPEAKERS) {
      delete (data.speakerValues[studentId] as Record<string, unknown>).speaker_strength;
    }
    expect(run(data).valid, JSON.stringify(run(data).issues)).toBe(true);
  });

  it("排名理由为空 → 不能提交", () => {
    const data = filledBallot();
    data.matchValues.ranking_rationale = "";
    expect(run(data).valid).toBe(false);
  });

  it("队伍两两对比是**可选**的（规范第 52 节）", () => {
    const data = filledBallot();
    expect(data.matchValues.compared_opening).toBeUndefined();
    expect(run(data).valid, JSON.stringify(run(data).issues)).toBe(true);
  });
});

describe("队伍合计只是参考，不决定名次（规范第 32 节）", () => {
  it("能算出两队发言者之和", () => {
    const { teamTotals } = computeBallotTotals(BP_TEMPLATE, filledBallot(), {
      teamMembersByTeam: SPEAKERS_BY_TEAM,
    });
    expect(teamTotals.og?.team_points).toBe(79 + 78);
    expect(teamTotals.cg?.team_points).toBe(77 + 77);
  });

  it("CG 的合计（154）低于 OG（157），但 CG 仍可排第一 —— **不阻止**", () => {
    const data = filledBallot();
    data.matchValues.final_ranking = { cg: 1, oo: 2, og: 3, co: 4 };
    const { teamTotals } = computeBallotTotals(BP_TEMPLATE, data, {
      teamMembersByTeam: SPEAKERS_BY_TEAM,
    });
    expect(teamTotals.cg?.team_points).toBeLessThan(teamTotals.og?.team_points as number);

    const result = canSubmitBallot(BP_TEMPLATE, data, {
      winnerTeamId: null,
      reasonForDecision: (data.matchValues.ranking_rationale as string) ?? null,
      expectedIds: EXPECTED,
      teamMembersByTeam: SPEAKERS_BY_TEAM,
    });
    expect(result.valid, JSON.stringify(result.issues)).toBe(true);
  });

  it("队伍合计的标签明确写了「不决定名次」", () => {
    const total = BP_TEMPLATE.totals?.find((t) => t.key === "team_points");
    expect(total?.label).toContain("不决定名次");
  });
});

describe("validateBallotData 直接校验排名", () => {
  it("排名对象里的名次必须是数字", () => {
    const data = filledBallot();
    data.matchValues.final_ranking = { cg: 1, oo: 2, og: 3 } as never;
    const result = validateBallotData(BP_TEMPLATE, data, EXPECTED);
    expect(result.valid).toBe(false);
  });
});
