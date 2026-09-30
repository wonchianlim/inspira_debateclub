// @vitest-environment node
import { describe, expect, it } from "vitest";

import { computeBallotTotals, validateBallotTemplate } from "@/lib/domain/ballot-schema";
import {
  EXTEMP_TEMPLATE,
  JWSD_TEMPLATE,
  OFFICIAL_TEMPLATES,
  PF_TEMPLATE,
  WSDC_TEMPLATE,
} from "@/lib/domain/official-templates";

/**
 * 官方模板的**共同约束**。
 *
 * 这里是横跨所有赛制的规则，逐份测容易漏 —— 所以对**整个注册表**跑一遍。
 * 将来加入 BP 时，只要它进了 `OFFICIAL_TEMPLATES`，下面的检查自动生效。
 */

const ENTRIES = Object.entries(OFFICIAL_TEMPLATES);

describe("注册表本身", () => {
  it("五种赛制都在注册表里（产品负责人已给出全部内容）", () => {
    expect(Object.keys(OFFICIAL_TEMPLATES).sort()).toEqual([
      "BP",
      "JWSD",
      "ONE_V_ONE",
      "PF",
      "WSDC",
    ]);
  });

  it("每一份都能通过模板校验", () => {
    for (const [formatCode, entry] of ENTRIES) {
      const result = validateBallotTemplate(entry.schema);
      expect(result.valid, `${formatCode}: ${JSON.stringify(result.issues)}`).toBe(true);
    }
  });
});

/**
 * 产品负责人 2026-09-29 明确：**1v1、JWSD、WSDC、BP 都不允许 Low Point Win**。
 *
 * ⚠️ 这条说明**修正了** 1v1 与 JWSD / WSDC 三份规范里原本"只警告、不阻止提交"的写法。
 * 因此这里断言的是**硬规则**（会进 issues、阻止提交），而不是软警告。
 */
/**
 * ⚠️ **BP 是刻意的例外**。
 *
 * BP 没有"胜方"字段 —— 它只有四支队伍的名次（1st–4th）。而规范第 32 节明确说
 * "Never automatically rank teams using combined speaker scores"，
 * 第 33 节又说名次与分数不一致"is a warning only. Do **not** automatically block
 * submission."
 *
 * 因此 BP 不进这一组断言。这不是遗漏，是有意为之；
 * 若将来产品负责人要求 BP 也硬阻止，需要先给 BP 一个"胜方"概念，
 * 那是与排名制不同的评分模型。
 */
const WINS_OR_LOSES_FORMATS = ENTRIES.filter(([code]) => code !== "BP");

describe("除 BP 外，所有赛制都不允许 Low Point Win 与平局", () => {
  it("BP **没有**胜负规则（它用排名，不是胜负）", () => {
    for (const rule of OFFICIAL_TEMPLATES.BP!.schema.rules ?? []) {
      expect(rule.kind).not.toBe("winnerMustHaveHighestTotal");
    }
    expect(OFFICIAL_TEMPLATES.BP!.schema.winnerRequired).toBe(false);
  });

  it("BP 有排名字段，且名次是 1st–4th", () => {
    const ranking = OFFICIAL_TEMPLATES.BP!.schema.fields.find((f) => f.type === "ranking");
    expect(ranking).toBeDefined();
    expect(ranking?.rankLabels).toEqual(["第 1 名", "第 2 名", "第 3 名", "第 4 名"]);
  });

  it("每一份模板都有「不能平局」的硬规则", () => {
    for (const [formatCode, entry] of WINS_OR_LOSES_FORMATS) {
      const rule = (entry.schema.rules ?? []).find((r) => r.kind === "totalsMustNotTie");
      expect(rule, `${formatCode} 缺少"不能平局"规则`).toBeDefined();
    }
  });

  it("每一份模板都有「胜方总分必须更高」的硬规则", () => {
    for (const [formatCode, entry] of WINS_OR_LOSES_FORMATS) {
      const rule = (entry.schema.rules ?? []).find((r) => r.kind === "winnerMustHaveHighestTotal");
      expect(rule, `${formatCode} 缺少"不允许 Low Point Win"规则`).toBeDefined();
    }
  });

  it("规则引用的总项在模板里真实存在（否则规则永远不会生效）", () => {
    for (const [formatCode, entry] of ENTRIES) {
      const totalKeys = new Set((entry.schema.totals ?? []).map((total) => total.key));
      for (const rule of entry.schema.rules ?? []) {
        expect(
          totalKeys.has(rule.totalKey),
          `${formatCode} 的规则引用了不存在的总项 ${rule.totalKey}`,
        ).toBe(true);
      }
    }
  });

  it("规则引用的总项必须是**队伍级**的（个人总分不能用来判断胜负）", () => {
    for (const [formatCode, entry] of ENTRIES) {
      for (const rule of entry.schema.rules ?? []) {
        const total = (entry.schema.totals ?? []).find(
          (candidate) => candidate.key === rule.totalKey,
        );
        /*
         * 队伍级总项有两种形态：
         *   - `team`：把该队伍自己的若干字段相加（1v1 的 30 分）
         *   - `teamFromSpeakers`：把队员的个人总分相加（JWSD / WSDC / PF）
         * 两者都能判断胜负；`speaker` 级的不行。
         */
        expect(["team", "teamFromSpeakers"], `${formatCode} 的规则引用了非队伍级总项`).toContain(
          total?.scope,
        );
      }
    }
  });

  it("拒绝信息是中文且明确指出不允许低分获胜", () => {
    for (const [formatCode, entry] of WINS_OR_LOSES_FORMATS) {
      const rule = (entry.schema.rules ?? []).find((r) => r.kind === "winnerMustHaveHighestTotal");
      expect(rule?.message, `${formatCode}`).toContain("Low Point Win");
    }
  });
});

describe("分制与满分", () => {
  it("WSDC 与 JWSD 的分制相同（Style 40 / Content 40 / Strategy 20 = 100）", () => {
    const categoryMax = (schema: typeof WSDC_TEMPLATE) => {
      const byKey = new Map(
        schema.fields
          .filter((f) => f.type === "score" && f.scope === "speaker")
          .map((f) => [f.key, f.max] as const),
      );
      return [byKey.get("style"), byKey.get("content"), byKey.get("strategy")];
    };
    expect(categoryMax(WSDC_TEMPLATE)).toEqual(categoryMax(JWSD_TEMPLATE));
    expect(categoryMax(WSDC_TEMPLATE)).toEqual([40, 40, 20]);
  });

  it("WSDC 三位**主**发言者都是整数分（规范第 38 节：0–40 / 0–40 / 0–20）", () => {
    for (const field of WSDC_TEMPLATE.fields) {
      if (field.type !== "score" || field.scope !== "speaker") continue;
      // 只检查主发言者的字段（前三位）
      if (!field.speakerPositions?.includes(1)) continue;
      expect(field.step, `${field.key} 应当是整数`).toBe(1);
    }
  });

  it("WSDC 的**回复**发言者允许半分（与 JWSD 一致）", () => {
    const replyFields = WSDC_TEMPLATE.fields.filter(
      (field) => field.type === "score" && field.speakerPositions?.includes(4),
    );
    expect(replyFields.length).toBeGreaterThan(0);
    for (const field of replyFields) {
      expect(field.step, `${field.key} 应当允许半分`).toBe(0.5);
    }
  });

  it("WSDC 的队伍总分是三位发言者之和（规范第 13 节：222 / 219）", () => {
    const data = {
      speakerValues: {
        "p-1": { style: 30, content: 30, strategy: 13 },
        "p-2": { style: 30, content: 30, strategy: 15 },
        "p-3": { style: 30, content: 30, strategy: 14 },
        "o-1": { style: 30, content: 30, strategy: 12 },
        "o-2": { style: 30, content: 30, strategy: 11 },
        "o-3": { style: 30, content: 30, strategy: 16 },
      },
      teamValues: {},
      matchValues: {},
    };
    const { teamTotals } = computeBallotTotals(WSDC_TEMPLATE, data, {
      teamMembersByTeam: {
        prop: ["p-1", "p-2", "p-3"],
        opp: ["o-1", "o-2", "o-3"],
      },
    });
    // 30+30+13=73, 30+30+15=75, 30+30+14=74 → 222
    expect(teamTotals.prop?.team_total).toBe(222);
    // 72 + 71 + 76 = 219
    expect(teamTotals.opp?.team_total).toBe(219);
  });

  /**
   * ⚠️ 产品负责人 2026-09-29 明确："JWSD 和 WSDC 的评分应该一样的，
   * 都是有 reply，reply 都是允许半分。"
   *
   * 这一条**修正了** WSDC 规范第 41 节"回复发言者应当另行配置"的写法。
   * 下面直接**比对两个模板的分制结构**，这是最贴近那句话的断言方式。
   */
  it("WSDC 与 JWSD 的评分结构**完全相同**（产品负责人明确要求）", () => {
    /** 取出"分制骨架"：字段键 + 满分 + 刻度 + 适用位次，忽略文案。 */
    const skeleton = (schema: typeof WSDC_TEMPLATE) =>
      schema.fields
        .filter((field) => field.type === "score" && field.scope === "speaker")
        .map((field) => ({
          key: field.key,
          max: field.max,
          step: field.step ?? 1,
          positions: field.speakerPositions ?? [],
        }))
        .sort((a, b) => a.key.localeCompare(b.key));

    expect(skeleton(WSDC_TEMPLATE)).toEqual(skeleton(JWSD_TEMPLATE));
  });

  it("两个赛制的个人总项也相同（主发言者 100、回复 50）", () => {
    const totalsOf = (schema: typeof WSDC_TEMPLATE) =>
      (schema.totals ?? [])
        .filter((total) => total.scope === "speaker")
        .map((total) => ({ key: total.key, max: total.max }))
        .sort((a, b) => a.key.localeCompare(b.key));

    expect(totalsOf(WSDC_TEMPLATE)).toEqual(totalsOf(JWSD_TEMPLATE));
    expect(totalsOf(WSDC_TEMPLATE)).toEqual([
      { key: "reply_total", max: 50 },
      { key: "speaker_total", max: 100 },
    ]);
  });

  it("WSDC 的队伍总分把主发言者与回复发言者都算进去（3×100 + 50 = 350）", () => {
    const teamTotal = WSDC_TEMPLATE.totals?.find((total) => total.key === "team_total");
    expect(teamTotal?.fromSpeakerTotals).toEqual(["speaker_total", "reply_total"]);
    expect(teamTotal?.max).toBe(350);
  });

  it("1v1 与 PF 的满分与规范一致", () => {
    const extempTotal = EXTEMP_TEMPLATE.totals?.find((total) => total.key === "total");
    expect(extempTotal?.max).toBe(30);

    const pfTotal = PF_TEMPLATE.totals?.find((total) => total.key === "team_points");
    expect(pfTotal?.max).toBe(60);
  });
});

/**
 * WSDC 的评分校准（产品负责人单独给的校准说明）。
 *
 * ⚠️ 这份校准说明**修正了** WSDC 规范第 39 节的写法：
 * 那里把 60–80 说成"建议范围"，而校准说明明确要求
 * "The system should reject: 59, 81, scores outside the 60–80 range"。
 * 因此它是**硬**区间（hardMin / hardMax），不是建议。
 */
describe("BP 的 60–85 是硬性区间", () => {
  it("个人得分的硬性区间是 60–85，且只用整数", () => {
    const total = OFFICIAL_TEMPLATES.BP!.schema.totals?.find((t) => t.key === "speaker_total");
    expect(total?.hardMin).toBe(60);
    expect(total?.hardMax).toBe(85);

    const scoreField = OFFICIAL_TEMPLATES.BP!.schema.fields.find((f) => f.key === "speaker_score");
    expect(scoreField?.step).toBe(1);
  });

  it("评分参照表的核心锚点是 85 / 78 / 75 / 60", () => {
    const anchors = new Map(
      (OFFICIAL_TEMPLATES.BP!.schema.guidance?.anchors ?? []).map(
        (a) => [a.score, a.label] as const,
      ),
    );
    expect(anchors.get(85)).toBe("God-like");
    expect(anchors.get(78)).toBe("Very Decent");
    expect(anchors.get(75)).toBe("Average");
    expect(anchors.get(60)).toBe("Minimum");
  });

  it("排名理由至少 150 字（规范第 36 节）", () => {
    const rationale = OFFICIAL_TEMPLATES.BP!.schema.fields.find(
      (f) => f.key === "ranking_rationale",
    );
    expect(rationale?.minLength).toBe(150);
  });

  it("每位发言者的改进建议是**必填**（规范第 57 节）", () => {
    const improve = OFFICIAL_TEMPLATES.BP!.schema.fields.find((f) => f.key === "speaker_improve");
    expect(improve?.required).toBe(true);
    expect(
      OFFICIAL_TEMPLATES.BP!.schema.fields.find((f) => f.key === "speaker_strength")?.required,
    ).toBe(false);
  });
});

describe("WSDC 的 60–80 是硬性区间", () => {
  const speakerTotal = WSDC_TEMPLATE.totals?.find((total) => total.key === "speaker_total");

  it("**主**发言者个人总分的硬性区间是 60–80", () => {
    expect(speakerTotal?.hardMin).toBe(60);
    expect(speakerTotal?.hardMax).toBe(80);
  });

  it("⚠️ 回复总分**没有**硬区间 —— 校准说明写的是 main speeches，而回复满分只有 50", () => {
    const replyTotal = WSDC_TEMPLATE.totals?.find((total) => total.key === "reply_total");
    expect(replyTotal?.hardMin).toBeUndefined();
    expect(replyTotal?.hardMax).toBeUndefined();
  });

  it("区间之外用 hardMin/hardMax（拒绝），区间之内用 confirm（仅提示）——两者性质不同", () => {
    // hardMin/hardMax 是拒绝；confirmBelow/confirmAbove 只是"请确认"
    expect(speakerTotal?.hardMin).toBeLessThan(speakerTotal?.confirmBelow ?? 0);
    expect(speakerTotal?.hardMax).toBeGreaterThan(speakerTotal?.confirmAbove ?? 0);
  });

  it("评分参照表存在、覆盖四个核心锚点，且区间是 60–80", () => {
    const guidance = WSDC_TEMPLATE.guidance;
    expect(guidance).toBeDefined();
    expect(guidance?.normalRange).toEqual([60, 80]);
    expect(guidance?.defaultScore).toBe(70);

    const anchors = new Map((guidance?.anchors ?? []).map((a) => [a.score, a.label] as const));
    expect(anchors.get(80)).toBe("God-like");
    expect(anchors.get(75)).toBe("Very Decent");
    expect(anchors.get(70)).toBe("Average");
    expect(anchors.get(60)).toBe("Minimum");
  });

  it("参照表的锚点都落在允许区间内（否则界面会展示一个打不出来的分数）", () => {
    for (const anchor of WSDC_TEMPLATE.guidance?.anchors ?? []) {
      expect(anchor.score, `锚点 ${anchor.score}`).toBeGreaterThanOrEqual(
        speakerTotal?.hardMin ?? 0,
      );
      expect(anchor.score, `锚点 ${anchor.score}`).toBeLessThanOrEqual(
        speakerTotal?.hardMax ?? 100,
      );
    }
  });

  it("只有 WSDC 与 BP 有硬性区间 —— 其余赛制没有（规范只对这两份提出）", () => {
    for (const [formatCode, entry] of ENTRIES) {
      if (formatCode === "WSDC" || formatCode === "BP") continue;
      for (const total of entry.schema.totals ?? []) {
        expect(total.hardMin, `${formatCode} 不应有硬性最低分`).toBeUndefined();
        expect(total.hardMax, `${formatCode} 不应有硬性最高分`).toBeUndefined();
      }
    }
  });
});

describe("WSDC 校准：平均 70 的分数构成（规范：Style 28 / Content 28 / Strategy 14）", () => {
  it("28 + 28 + 14 = 70", () => {
    const data = {
      speakerValues: { "p-1": { style: 28, content: 28, strategy: 14 } },
      teamValues: {},
      matchValues: {},
    };
    const { speakerTotals } = computeBallotTotals(WSDC_TEMPLATE, data);
    expect(speakerTotals["p-1"]?.speaker_total).toBe(70);
  });

  it("很不错的演讲 30 + 30 + 15 = 75", () => {
    const data = {
      speakerValues: { "p-1": { style: 30, content: 30, strategy: 15 } },
      teamValues: {},
      matchValues: {},
    };
    const { speakerTotals } = computeBallotTotals(WSDC_TEMPLATE, data);
    expect(speakerTotals["p-1"]?.speaker_total).toBe(75);
  });

  it("分项不必对称：32 / 29 / 14 = 75（表达强、策略一般）", () => {
    const data = {
      speakerValues: { "p-1": { style: 32, content: 29, strategy: 14 } },
      teamValues: {},
      matchValues: {},
    };
    const { speakerTotals } = computeBallotTotals(WSDC_TEMPLATE, data);
    expect(speakerTotals["p-1"]?.speaker_total).toBe(75);
  });
});

/**
 * 产品负责人 2026-09-29：**WSDC 与 JWSD 的队伍总分差必须在 0.5–12 分之间**。
 *
 * 只针对这两个赛制 —— 1v1 的队伍满分才 30 分，差 12 分是另一个量级；
 * PF 的规范也没有这条。因此断言里**明确检查哪两份有、哪两份没有**。
 */
describe("队伍总分差的硬性区间（仅 WSDC 与 JWSD）", () => {
  const withGapRule = ENTRIES.filter(([, entry]) =>
    (entry.schema.rules ?? []).some((rule) => rule.kind === "teamTotalGapWithinRange"),
  ).map(([code]) => code);

  it("只有 WSDC 与 JWSD 有这条规则（BP 的排名差距不设限）", () => {
    expect(withGapRule.sort()).toEqual(["JWSD", "WSDC"]);
  });

  it("1v1 与 PF **没有**这条规则（产品负责人的说明不包含它们）", () => {
    expect(withGapRule).not.toContain("ONE_V_ONE");
    expect(withGapRule).not.toContain("PF");
  });

  it("区间是 0.5 到 12", () => {
    for (const code of withGapRule) {
      const rule = (OFFICIAL_TEMPLATES[code]!.schema.rules ?? []).find(
        (candidate) => candidate.kind === "teamTotalGapWithinRange",
      );
      expect(rule, code).toMatchObject({ minGap: 0.5, maxGap: 12 });
    }
  });

  it("下界 0.5 正好使「不能平局」成为它的特例", () => {
    for (const code of withGapRule) {
      const rule = (OFFICIAL_TEMPLATES[code]!.schema.rules ?? []).find(
        (candidate) => candidate.kind === "teamTotalGapWithinRange",
      );
      // 允许半分的赛制里，最小非零差距就是 0.5
      expect(typeof rule === "object" && "minGap" in rule ? rule.minGap : null).toBe(0.5);
    }
  });

  it("规则引用的总项真实存在且是队伍级", () => {
    for (const code of withGapRule) {
      const schema = OFFICIAL_TEMPLATES[code]!.schema;
      const rule = (schema.rules ?? []).find((r) => r.kind === "teamTotalGapWithinRange");
      const total = (schema.totals ?? []).find(
        (t) => t.key === (rule as { totalKey: string }).totalKey,
      );
      expect(total, code).toBeDefined();
      expect(["team", "teamFromSpeakers"], code).toContain(total?.scope);
    }
  });
});
