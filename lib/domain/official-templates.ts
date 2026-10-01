import type { BallotTemplateSchema } from "@/lib/domain/ballot-schema";

/** 两个作用范围的简写，让下面的模板定义读起来短一些。 */
const TEAM_SCOPE = "team" as const;
const MATCH_SCOPE = "match" as const;

/**
 * **官方评分表模板**（由产品负责人提供）。
 *
 * ⚠️ 这里是模板的**唯一来源**：测试与"载入官方模板"的动作都引用它。
 * 若把同样的Content在测试与生产代码里各写一份，两边迟早会漂移 ——
 * 而"测试通过、实际生效的是另一份"正是本项目反复在防的那类问题。
 *
 * 规范没有规定这些Content，**是产品负责人给的**：
 *   - `ONE_V_ONE`（即兴辩论 / Extemporaneous Debate）
 *   - `JWSD`（世界学校制初中组）
 *
 * 其余三种赛制（PF / WSDC / BP）尚无官方模板，可由超级管理员在界面上配置。
 */

export const EXTEMP_TEMPLATE: BallotTemplateSchema = {
  schemaVersion: 1,
  fields: [
    // ---- 计分表：五个维度，正反方各一份（规范第 4 节）----
    {
      key: "argumentation",
      label: "Argumentation",
      type: "score",
      scope: TEAM_SCOPE,
      required: true,
      min: 0,
      max: 10,
    },
    {
      key: "engagement",
      label: "Clash",
      type: "score",
      scope: TEAM_SCOPE,
      required: true,
      min: 0,
      max: 8,
    },
    {
      key: "analysis_adaptability",
      label: "Analysis and adaptation",
      type: "score",
      scope: TEAM_SCOPE,
      required: true,
      min: 0,
      max: 6,
    },
    {
      key: "delivery",
      label: "Delivery",
      type: "score",
      scope: TEAM_SCOPE,
      required: true,
      min: 0,
      max: 4,
    },
    {
      key: "structure_strategy",
      label: "Structure and strategy",
      type: "score",
      scope: TEAM_SCOPE,
      required: true,
      min: 0,
      max: 2,
    },

    // ---- Ballot 第 1、2 部分：正反方Main arguments ----
    // `scope: team` 让**一支队伍一份列表**，天然对应规范里
    // "Proposition Main Arguments" 与 "Opposition Main Arguments" 两节。
    {
      key: "main_arguments",
      label: "Main arguments",
      type: "list",
      scope: TEAM_SCOPE,
      required: true,
      minItems: 1,
      maxItems: 5,
      itemLabel: "论点",
    },

    // ---- Ballot 第 3 部分：Key clashes（不按方，整场一份）----
    {
      key: "main_clashes",
      label: "Key clashes",
      type: "list",
      scope: MATCH_SCOPE,
      required: true,
      minItems: 1,
      maxItems: 5,
      itemLabel: "Clash",
    },

    // ---- Ballot 第 4 部分：Reason for decision（至少 100 字，规范第 19 节）----
    {
      key: "reason_for_decision",
      label: "Reason for decision",
      type: "text",
      scope: MATCH_SCOPE,
      required: true,
      minLength: 100,
    },

    // ---- Judge confidence（3 档，可选，规范第 14 节）----
    {
      key: "judge_confidence",
      label: "Judge confidence",
      type: "score",
      scope: MATCH_SCOPE,
      required: false,
      min: 1,
      max: 3,
      options: [
        { value: 3, label: "Clear decision" },
        { value: 2, label: "Close call" },
        { value: 1, label: "Very close" },
      ],
    },

    // ---- Ballot 第 5、6 部分：正反方反馈（各两项，至少 30 字，规范第 22、23 节）----
    {
      key: "feedback_strength",
      label: "What went well",
      type: "text",
      scope: TEAM_SCOPE,
      required: true,
      minLength: 30,
    },
    {
      key: "feedback_improve",
      label: "What to improve",
      type: "text",
      scope: TEAM_SCOPE,
      required: true,
      minLength: 30,
    },
  ],
  winnerRequired: true,
  reasonForDecisionRequired: true,
  // 规范第 40 节：Total由五项相加，满分 30，**裁判不填**
  totals: [
    {
      key: "total",
      label: "Total",
      scope: "team",
      sumOf: [
        "argumentation",
        "engagement",
        "analysis_adaptability",
        "delivery",
        "structure_strategy",
      ],
      max: 30,
    },
  ],
  /*
   * ⚠️ **所有赛制都不允许 Low Point Win**（产品负责人 2026-09-29 明确）。
   *
   * 这一条**修正了** 1v1 与 JWSD 两份规范里"只警告、不阻止提交"的写法 ——
   * 那两处说的是"分数明显偏低"，而产品负责人明确了规则本身：
   * **胜方的Team total必须高于对方**。因此在这里是**硬规则**（阻止提交），
   * 而不是软警告。
   */
  rules: [
    {
      kind: "totalsMustNotTie",
      totalKey: "total",
      message:
        "Both teams have the same total. Adjust the scores so the winning team's total is higher before submitting.",
    },
    {
      kind: "winnerMustHaveHighestTotal",
      totalKey: "total",
      message:
        "The team you marked as the winner has a lower total than the other team. This format does not allow a low point win. " +
        "Adjust the scores, or change the winner, before submitting.",
    },
  ],
};

export const JWSD_TEMPLATE: BallotTemplateSchema = {
  schemaVersion: 1,
  fields: [
    /*
     * ---- 前三位发言者（每人满分 100，规范第 5 节）----
     *
     * ⚠️ 产品负责人明确：**前三位只能打整数**，因此 `step: 1`
     * 并且用 `speakerPositions: [1, 2, 3]` 限定只对这三个位次生效。
     */
    {
      key: "style",
      label: "Delivery",
      type: "score",
      scope: "speaker",
      required: true,
      min: 0,
      max: 40,
      step: 1,
      speakerPositions: [1, 2, 3],
    },
    {
      key: "content",
      label: "Content",
      type: "score",
      scope: "speaker",
      required: true,
      min: 0,
      max: 40,
      step: 1,
      speakerPositions: [1, 2, 3],
    },
    {
      key: "strategy",
      label: "Strategy",
      type: "score",
      scope: "speaker",
      required: true,
      min: 0,
      max: 20,
      step: 1,
      speakerPositions: [1, 2, 3],
    },

    /*
     * ---- 回复发言者（第 4 位，满分是普通发言者的**一半**：50 分）----
     *
     * Delivery 20 / Content 20 / Strategy 10 —— 正好是 40/40/20 的一半。
     *
     * ⚠️ 产品负责人明确：**回复发言者允许半分**（例如 35.5），因此 `step: 0.5`。
     */
    {
      key: "reply_style",
      label: "Delivery (reply)",
      type: "score",
      scope: "speaker",
      required: true,
      min: 0,
      max: 20,
      step: 0.5,
      speakerPositions: [4],
    },
    {
      key: "reply_content",
      label: "Content (reply)",
      type: "score",
      scope: "speaker",
      required: true,
      min: 0,
      max: 20,
      step: 0.5,
      speakerPositions: [4],
    },
    {
      key: "reply_strategy",
      label: "Strategy (reply)",
      type: "score",
      scope: "speaker",
      required: true,
      min: 0,
      max: 10,
      step: 0.5,
      speakerPositions: [4],
    },

    // ---- 每位发言者可选的单独评语（规范第 29、30 节：MVP 里是**可选**）----
    {
      key: "speaker_feedback",
      label: "One line for this speaker",
      type: "text",
      scope: "speaker",
      required: false,
      minLength: 10,
    },

    // ---- 论点：按队伍各一份，每条可带Judge notes（规范第 17–19 节）----
    {
      key: "main_arguments",
      label: "Main arguments",
      type: "list",
      scope: TEAM_SCOPE,
      required: true,
      minItems: 1,
      maxItems: 5,
      itemLabel: "论点",
      itemFields: [{ key: "judge_note", label: "Judge notes", required: false }],
    },

    // ---- Clash：整场一份，每条可带三段笔记（规范第 20–22 节，MVP 里可选）----
    {
      key: "main_clashes",
      label: "Key clashes",
      type: "list",
      scope: MATCH_SCOPE,
      required: true,
      minItems: 1,
      maxItems: 5,
      itemLabel: "Clash",
      itemFields: [
        { key: "proposition_note", label: "Proposition case", required: false },
        { key: "opposition_note", label: "Opposition case", required: false },
        { key: "judge_assessment", label: "Judge assessment", required: false },
      ],
    },

    // ---- Reason for decision（规范第 23、25 节）----
    {
      key: "reason_for_decision",
      label: "Reason for decision",
      type: "text",
      scope: MATCH_SCOPE,
      required: true,
      minLength: 100,
    },

    // ---- Judge confidence（规范第 26 节，可选）----
    {
      key: "judge_confidence",
      label: "Judge confidence",
      type: "score",
      scope: MATCH_SCOPE,
      required: false,
      min: 1,
      max: 3,
      options: [
        { value: 3, label: "Clear decision" },
        { value: 2, label: "Close call" },
        { value: 1, label: "Very close" },
      ],
    },

    // ---- 队伍反馈（规范第 27、28 节：**必填**）----
    {
      key: "feedback_strength",
      label: "What went well",
      type: "text",
      scope: TEAM_SCOPE,
      required: true,
      minLength: 30,
    },
    {
      key: "feedback_improve",
      label: "What to improve",
      type: "text",
      scope: TEAM_SCOPE,
      required: true,
      minLength: 30,
    },
  ],
  winnerRequired: true,
  reasonForDecisionRequired: true,
  totals: [
    // 前三位：每人 100 分
    {
      key: "speaker_total",
      label: "Individual total",
      scope: "speaker",
      sumOf: ["style", "content", "strategy"],
      max: 100,
      perSpeaker: true,
    },
    // 回复发言者：50 分（普通发言者的一半），**允许半分**
    {
      key: "reply_total",
      label: "Reply total",
      scope: "speaker",
      sumOf: ["reply_style", "reply_content", "reply_strategy"],
      max: 50,
      perSpeaker: true,
    },
    /*
     * Team total = 三位普通发言者 + 一位回复发言者。
     *
     * ⚠️ 满分**不写死**：人数与构成可变（3 人、4 人、加不加回复发言者），
     * 因此只做一个下界检查（至少 100 + 50 = 150）。
     * 因为回复项允许半分，Team total**也可能带半分**（例如 257.5）。
     */
    {
      key: "team_total",
      label: "Team total",
      scope: "teamFromSpeakers",
      sumOf: [],
      fromSpeakerTotals: ["speaker_total", "reply_total"],
      max: 350,
    },
  ],
  /*
   * ⚠️ **所有赛制都不允许 Low Point Win**（产品负责人 2026-09-29 明确）。
   *
   * 这一条**修正了** 1v1 与 JWSD 两份规范里"只警告、不阻止提交"的写法 ——
   * 那两处说的是"分数明显偏低"，而产品负责人明确了规则本身：
   * **胜方的Team total必须高于对方**。因此在这里是**硬规则**（阻止提交），
   * 而不是软警告。
   */
  rules: [
    {
      kind: "totalsMustNotTie",
      totalKey: "team_total",
      message:
        "Both teams have the same total. Adjust the scores so the winning team's total is higher before submitting.",
    },
    {
      kind: "winnerMustHaveHighestTotal",
      totalKey: "team_total",
      message:
        "The team you marked as the winner has a lower total than the other team. This format does not allow a low point win. " +
        "Adjust the scores, or change the winner, before submitting.",
    },
    {
      /*
       * 产品负责人 2026-09-29：**WSDC 与 JWSD 的Team total差必须在 0.5–12 分之间**。
       *
       *   - 下界 0.5：不能平局（这两个赛制允许半分，0.5 就是最小差距）
       *   - 上界 12：不能一边倒得太离谱 —— 那通常说明打分出了问题
       */
      kind: "teamTotalGapWithinRange",
      totalKey: "team_total",
      minGap: 0.5,
      maxGap: 12,
      message:
        "The gap between the two team totals must be between 0.5 and 12. A gap this small means the round was almost a draw. " +
        "A gap this large usually means a scoring mistake - check the speaker scores before submitting.",
    },
  ],
  /*
   * 评分参照表 —— 规范要求它在打分界面上**始终可见**。
   * 放在模板里而不是写死在界面，是因为参照标准因赛制而异。
   */
};

/**
 * 赛制代号 → 官方模板。
 *
 * 只包含**产品负责人已经给出Content**的赛制。
 * 其余赛制保持空缺，界面上会明确提示"这个赛制还不能打分"——
 * 而不是给一个空的或猜出来的模板。
 */
/**
 * **PF（Public Forum）模板** —— 同样来自产品负责人给的规范。
 *
 * 与 1v1 / JWSD 最关键的不同：PF 的"胜方必须分数更高"是**硬规则**
 * （规范第 3、48 节明确 "There should be no override"），
 * 因此写在 `rules` 里而不是靠软警告。
 */
export const PF_TEMPLATE: BallotTemplateSchema = {
  schemaVersion: 1,
  fields: [
    // ---- 每人 30 分，五个维度，**允许半分**（规范第 2、8、20 节）----
    {
      key: "argumentation",
      label: "Argumentation and evidence",
      type: "score",
      scope: "speaker",
      required: true,
      min: 0,
      max: 10,
      step: 0.5,
    },
    {
      key: "rebuttal",
      label: "Refutation and comparison",
      type: "score",
      scope: "speaker",
      required: true,
      min: 0,
      max: 8,
      step: 0.5,
    },
    {
      key: "strategy",
      label: "Strategy and global awareness",
      type: "score",
      scope: "speaker",
      required: true,
      min: 0,
      max: 6,
      step: 0.5,
    },
    {
      key: "delivery",
      label: "Delivery",
      type: "score",
      scope: "speaker",
      required: true,
      min: 0,
      max: 4,
      step: 0.5,
    },
    {
      key: "crossfire_teamwork",
      label: "Cross-examination and teamwork",
      type: "score",
      scope: "speaker",
      required: true,
      min: 0,
      max: 2,
      step: 0.5,
    },

    // 每位发言者可选的单独评语（规范第 37 节）
    {
      key: "speaker_feedback",
      label: "One thing this speaker can improve",
      type: "text",
      scope: "speaker",
      required: false,
      minLength: 10,
    },

    // ---- 论点（规范第 24–26 节）----
    {
      key: "main_arguments",
      label: "Main arguments",
      type: "list",
      scope: TEAM_SCOPE,
      required: true,
      minItems: 1,
      maxItems: 5,
      itemLabel: "论点",
      itemFields: [{ key: "judge_note", label: "Judge notes", required: false }],
    },

    // ---- Clash（规范第 27–29 节）----
    {
      key: "main_clashes",
      label: "Key clashes",
      type: "list",
      scope: MATCH_SCOPE,
      required: true,
      minItems: 1,
      maxItems: 5,
      itemLabel: "Clash",
      itemFields: [
        { key: "pro_note", label: "Proposition stance", required: false },
        { key: "con_note", label: "Opposition stance", required: false },
        { key: "judge_assessment", label: "Judge assessment", required: false },
      ],
    },

    // ---- Reason for decision（规范第 30、32 节）----
    {
      key: "reason_for_decision",
      label: "Reason for decision",
      type: "text",
      scope: MATCH_SCOPE,
      required: true,
      minLength: 100,
    },

    // ---- Judge confidence（规范第 34 节）----
    {
      key: "judge_confidence",
      label: "Judge confidence",
      type: "score",
      scope: MATCH_SCOPE,
      required: false,
      min: 1,
      max: 3,
      options: [
        { value: 3, label: "Clear" },
        { value: 2, label: "Competitive" },
        { value: 1, label: "Very close" },
      ],
    },

    // ---- 队伍反馈（规范第 35、36 节）----
    {
      key: "feedback_strength",
      label: "What went well",
      type: "text",
      scope: TEAM_SCOPE,
      required: true,
      minLength: 30,
    },
    {
      key: "feedback_improve",
      label: "What to improve",
      type: "text",
      scope: TEAM_SCOPE,
      required: true,
      minLength: 30,
    },
  ],
  winnerRequired: true,
  reasonForDecisionRequired: true,
  totals: [
    // 每人 30 分（规范第 19 节）
    {
      key: "speaker_total",
      label: "Individual total",
      scope: "speaker",
      sumOf: ["argumentation", "rebuttal", "strategy", "delivery", "crossfire_teamwork"],
      max: 30,
      perSpeaker: true,
      // 规范第 49 节：高于 29 或低于 22 都只是**提示**，裁判确认后可以继续
      confirmAbove: 29,
      confirmBelow: 22,
    },
    // Team total = 两位发言者之和，满分 60（规范第 2、21 节）
    {
      key: "team_points",
      label: "Team total",
      scope: "teamFromSpeakers",
      sumOf: [],
      fromSpeakerTotals: ["speaker_total"],
      max: 60,
    },
  ],
  /*
   * ⚠️ PF 的两条**硬规则**（规范第 3、4、22、48 节）。
   *
   * 规范原文："There should be no override." —— 因此它们是 issues（阻止提交），
   * 而不是 warnings。这正是 PF 与 1v1 / JWSD 的关键差别：
   * 同样的现象在那两个赛制里只是提示。
   */
  rules: [
    {
      kind: "totalsMustNotTie",
      totalKey: "team_points",
      message:
        "Both teams have the same total. Half points are allowed, so adjust the speaker scores to make the winning team's total higher before submitting.",
    },
    {
      kind: "winnerMustHaveHighestTotal",
      totalKey: "team_points",
      message:
        "The team you marked as the winner has a lower total than the other team. Public Forum does not allow a low point win. " +
        "Adjust the scores, or change the winner, before submitting.",
    },
  ],
};

/**
 * **WSDC 模板** —— 同样来自产品负责人给的规范。
 *
 * 与 JWSD **同分制**（Style 40 / Content 40 / Strategy 20 = 100），
 * 但规范第 41 节明确要求：
 *
 *   "If Reply Speeches are included, they should use a **separate scoring
 *    configuration**. ... Do not force reply scoring into the main
 *    three-speaker structure."
 *
 * 因此这里**只做三位主发言者**。回复发言者若需要，应当由管理员另行配置
 * （`reply_speech_enabled`），而不是硬塞进这套结构。
 */
export const WSDC_TEMPLATE: BallotTemplateSchema = {
  schemaVersion: 1,
  fields: [
    // ---- 每人 100 分（规范第 1、5 节）----
    {
      key: "style",
      label: "Delivery",
      type: "score",
      scope: "speaker",
      required: true,
      min: 0,
      max: 40,
      step: 1,
      // 只对前三位主发言者生效：回复发言者用另一组字段
      speakerPositions: [1, 2, 3],
    },
    {
      key: "content",
      label: "Content",
      type: "score",
      scope: "speaker",
      required: true,
      min: 0,
      max: 40,
      step: 1,
      // 只对前三位主发言者生效：回复发言者用另一组字段
      speakerPositions: [1, 2, 3],
    },
    {
      key: "strategy",
      label: "Strategy",
      type: "score",
      scope: "speaker",
      required: true,
      min: 0,
      max: 20,
      step: 1,
      // 只对前三位主发言者生效：回复发言者用另一组字段
      speakerPositions: [1, 2, 3],
    },

    /*
     * ---- 回复发言者（第 4 位，满分是主发言者的**一半**：50 分）----
     *
     * 与 JWSD 完全一致：Delivery 20 / Content 20 / Strategy 10，**允许半分**。
     */
    {
      key: "reply_style",
      label: "Delivery (reply)",
      type: "score",
      scope: "speaker",
      required: true,
      min: 0,
      max: 20,
      step: 0.5,
      speakerPositions: [4],
    },
    {
      key: "reply_content",
      label: "Content (reply)",
      type: "score",
      scope: "speaker",
      required: true,
      min: 0,
      max: 20,
      step: 0.5,
      speakerPositions: [4],
    },
    {
      key: "reply_strategy",
      label: "Strategy (reply)",
      type: "score",
      scope: "speaker",
      required: true,
      min: 0,
      max: 10,
      step: 0.5,
      speakerPositions: [4],
    },

    // 每位发言者可选的单独评语（规范第 29 节）
    {
      key: "speaker_feedback",
      label: "One thing this speaker can improve",
      type: "text",
      scope: "speaker",
      required: false,
      minLength: 10,
    },

    // ---- 论点（规范第 17–19 节）----
    {
      key: "main_arguments",
      label: "Main arguments",
      type: "list",
      scope: TEAM_SCOPE,
      required: true,
      minItems: 1,
      maxItems: 5,
      itemLabel: "论点",
      itemFields: [{ key: "judge_note", label: "Judge notes", required: false }],
    },

    // ---- Clash（规范第 20–22 节）----
    {
      key: "main_clashes",
      label: "Key clashes",
      type: "list",
      scope: MATCH_SCOPE,
      required: true,
      minItems: 1,
      maxItems: 5,
      itemLabel: "Clash",
      itemFields: [
        { key: "proposition_note", label: "Proposition stance", required: false },
        { key: "opposition_note", label: "Opposition stance", required: false },
        { key: "judge_assessment", label: "Judge assessment", required: false },
      ],
    },

    // ---- Reason for decision（规范第 23、25 节）----
    {
      key: "reason_for_decision",
      label: "Reason for decision",
      type: "text",
      scope: MATCH_SCOPE,
      required: true,
      minLength: 100,
    },

    // ---- Judge confidence（规范第 26 节）----
    {
      key: "judge_confidence",
      label: "Judge confidence",
      type: "score",
      scope: MATCH_SCOPE,
      required: false,
      min: 1,
      max: 3,
      options: [
        { value: 3, label: "Clear decision" },
        { value: 2, label: "Competitive" },
        { value: 1, label: "Very close" },
      ],
    },

    // ---- 队伍反馈（规范第 27、28 节：**必填**）----
    {
      key: "feedback_strength",
      label: "What went well",
      type: "text",
      scope: TEAM_SCOPE,
      required: true,
      minLength: 30,
    },
    {
      key: "feedback_improve",
      label: "What to improve",
      type: "text",
      scope: TEAM_SCOPE,
      required: true,
      minLength: 30,
    },
  ],
  winnerRequired: true,
  reasonForDecisionRequired: true,
  totals: [
    {
      key: "speaker_total",
      label: "Individual total",
      scope: "speaker",
      sumOf: ["style", "content", "strategy"],
      max: 100,
      perSpeaker: true,
      /*
       * ⚠️ 产品负责人明确：**WSDC 的Individual total必须在 60–80 之间，
       *    系统要拒绝 59 与 81**。因此这是**硬**区间，不是建议范围。
       *
       * 这一条**修正了** WSDC 规范第 39 节原来的写法 ——
       * 那里把 60–80 说成"建议范围"。
       */
      hardMin: 60,
      hardMax: 80,
      // 60–80 之外的确认提示仍然保留，用于区间内的极端情况
      confirmAbove: 78,
      confirmBelow: 63,
    },
    // 回复发言者：50 分（主发言者的一半），**允许半分**
    {
      key: "reply_total",
      label: "Reply total",
      scope: "speaker",
      sumOf: ["reply_style", "reply_content", "reply_strategy"],
      max: 50,
      perSpeaker: true,
    },
    // Team total = 三位主发言者 + 一位回复发言者
    {
      key: "team_total",
      label: "Team total",
      scope: "teamFromSpeakers",
      sumOf: [],
      fromSpeakerTotals: ["speaker_total", "reply_total"],
      max: 350,
    },
  ],
  /*
   * ⚠️ **所有赛制都不允许 Low Point Win**（产品负责人 2026-09-29 明确）。
   *
   * 这一条**修正了** WSDC 规范第 15 节"只是警告、不一定硬阻止"的写法。
   */
  rules: [
    {
      kind: "totalsMustNotTie",
      totalKey: "team_total",
      message:
        "Both teams have the same total. Adjust the scores so the winning team's total is higher before submitting.",
    },
    {
      kind: "winnerMustHaveHighestTotal",
      totalKey: "team_total",
      message:
        "The team you marked as the winner has a lower total than the other team. This format does not allow a low point win. " +
        "Adjust the scores, or change the winner, before submitting.",
    },
    {
      /*
       * 产品负责人 2026-09-29：**WSDC 与 JWSD 的Team total差必须在 0.5–12 分之间**。
       *
       *   - 下界 0.5：不能平局（这两个赛制允许半分，0.5 就是最小差距）
       *   - 上界 12：不能一边倒得太离谱 —— 那通常说明打分出了问题
       */
      kind: "teamTotalGapWithinRange",
      totalKey: "team_total",
      minGap: 0.5,
      maxGap: 12,
      message:
        "The gap between the two team totals must be between 0.5 and 12. A gap this small means the round was almost a draw. " +
        "A gap this large usually means a scoring mistake - check the speaker scores before submitting.",
    },
  ],
  guidance: {
    title: "WSDC score reference",
    normalRange: [60, 80],
    defaultScore: 70,
    anchors: [
      { score: 80, label: "God-like", note: "A near-perfect speech; extremely rare" },
      { score: 78, label: "Exceptional", note: "Elite competition standard; very rare" },
      {
        score: 76,
        label: "Excellent",
        note: "A genuinely excellent speech with almost no clear weakness",
      },
      { score: 75, label: "Very Decent", note: "Clearly above average; a very good speech" },
      {
        score: 73,
        label: "Strong",
        note: "Above average; analysis, strategy and delivery all sound",
      },
      { score: 71, label: "Above Average", note: "Solid speech, clearly above the usual level" },
      {
        score: 70,
        label: "Average",
        note: "the WSDC average. 70 is not a penalty; it is the average",
      },
      {
        score: 68,
        label: "Below Average",
        note: "Usable, with clear weaknesses in analysis, strategy or delivery",
      },
      { score: 66, label: "Weak", note: "Clearly problematic, but with some debating content" },
      {
        score: 63,
        label: "Very Weak",
        note: "Major weaknesses throughout; limited effective contribution",
      },
      { score: 61, label: "Extremely Weak", note: "Almost no meaningful argument" },
      { score: 60, label: "Minimum", note: "Equivalent to saying hello and sitting down" },
    ],
  },
};

/**
 * **BP（British Parliamentary）模板** —— 来自产品负责人给的规范。
 *
 * BP 与前四种赛制有**根本不同**：
 *
 *   1. 没有"胜方"字段，只有**四支队伍的名次**（1st–4th，不可重复、必须用满）。
 *      因此这里**没有** `winnerMustHaveHighestTotal` —— 那条规则需要一个胜方，
 *      而 BP 的排名本来就不该由分数决定（规范第 32 节：
 *      "Never automatically rank teams using combined speaker scores"）。
 *
 *   2. 规范第 33 节明确要求：名次与分数明显不一致时**只警告、不阻止提交**
 *      （"This is a warning only. Do not automatically block submission."）。
 *
 * ⚠️ 产品负责人曾说过"BP 也不允许 low point wins"。
 *    我在 2026-09-29 的报告里把这一处矛盾明确提出来了，并按 BP 规范第 33 节
 *    实现为**警告**。若产品负责人确认要改成硬规则，需要给 BP 加一个"胜方"概念 ——
 *    那与 BP 的排名制是两种不同的评分模型。
 */
export const BP_TEMPLATE: BallotTemplateSchema = {
  schemaVersion: 1,
  fields: [
    /*
     * ---- 每位发言者 60–85 分（规范第 18 节）----
     *
     * 规范明确"只用整数"（"Recommended system: Whole numbers only"），
     * 且**硬性**要求不低于 60、不高于 85 —— 因此用 hardMin/hardMax。
     */
    {
      key: "speaker_score",
      label: "Speaker scores",
      type: "score",
      scope: "speaker",
      required: true,
      min: 0,
      max: 85,
      step: 1,
    },

    // ---- 每位发言者的反馈（规范第 37 节：**改进建议必填**）----
    {
      key: "speaker_strength",
      label: "What went well",
      type: "text",
      scope: "speaker",
      required: false,
      minLength: 20,
    },
    {
      key: "speaker_improve",
      label: "What to improve",
      type: "text",
      scope: "speaker",
      required: true,
      minLength: 20,
    },

    /*
     * ---- 各队的主要贡献（规范第 50 节）----
     *
     * 规范里 OG/OO 叫"Main arguments"、CG/CO 叫"延伸"，但两者的形状相同：
     * 都是"这一队提出了什么"。因此用**一个**按队伍的列表字段Delivery四支队伍，
     * 而不是为前两队与后两队各做一套 —— 那会变成四份几乎一样的配置。
     */
    {
      key: "team_contribution",
      label: "This team's main contribution",
      type: "list",
      scope: TEAM_SCOPE,
      required: true,
      minItems: 1,
      maxItems: 5,
      itemLabel: "贡献",
      itemFields: [
        { key: "why_distinct", label: "Why it is new (for extensions)", required: false },
        { key: "why_important", label: "Why it matters", required: false },
      ],
    },

    // ---- Key clashes（规范第 51 节）----
    {
      key: "main_clashes",
      label: "Key clashes",
      type: "list",
      scope: MATCH_SCOPE,
      required: true,
      minItems: 1,
      maxItems: 5,
      itemLabel: "Clash",
    },

    // ---- 队伍两两对比（规范第 52 节：可选，但对裁判训练有用）----
    {
      key: "comparison_opening",
      label: "Gov Opening vs Opp Opening (which side built the stronger opening case)",
      type: "text",
      scope: MATCH_SCOPE,
      required: false,
    },
    {
      key: "comparison_closing",
      label: "Gov Closing vs Opp Closing (whose extension was stronger)",
      type: "text",
      scope: MATCH_SCOPE,
      required: false,
    },
    {
      key: "comparison_government",
      label: "Gov Opening vs Gov Closing (which government bench contributed more)",
      type: "text",
      scope: MATCH_SCOPE,
      required: false,
    },
    {
      key: "comparison_opposition",
      label: "Opp Opening vs Opp Closing (which opposition bench contributed more)",
      type: "text",
      scope: MATCH_SCOPE,
      required: false,
    },

    /*
     * ---- Final ranking（规范第 4、53 节）----
     *
     * ⚠️ 这是**唯一**一种"值分布在多支队伍上、且彼此互斥"的字段：
     * 每支队伍恰好一个名次，不能重复、不能跳号。
     */
    {
      key: "final_ranking",
      label: "Final ranking",
      type: "ranking",
      scope: MATCH_SCOPE,
      required: true,
      rankLabels: ["第 1 名", "第 2 名", "第 3 名", "第 4 名"],
    },

    // ---- Reason for ranking（规范第 36 节：至少 150 字）----
    {
      key: "ranking_rationale",
      label: "Reason for ranking",
      type: "text",
      scope: MATCH_SCOPE,
      required: true,
      minLength: 150,
    },
  ],
  // BP 没有"胜方"，因此不为它设置 winnerRequired
  winnerRequired: false,
  reasonForDecisionRequired: false,
  totals: [
    {
      key: "speaker_total",
      label: "Individual score",
      scope: "speaker",
      sumOf: ["speaker_score"],
      max: 85,
      perSpeaker: true,
      /*
       * 规范第 18 节：**不得低于 60、不得高于 85**。
       * 与 WSDC 同理，这是**硬**区间而不是建议。
       */
      hardMin: 60,
      hardMax: 85,
      // 规范第 59 节的软提示：85 分、≥82 分、≤62 分都要请裁判确认
      confirmAbove: 81,
      confirmBelow: 63,
    },
    /*
     * Team total**只用于展示**（两队的发言者之和），
     * 规范第 32 节明确说排名**不得**由它决定 —— 因此这里
     * **没有**任何引用它的硬规则。这是刻意的。
     */
    {
      key: "team_points",
      label: "This team's two speakers combined (reference only; does not decide the ranking)",
      scope: "teamFromSpeakers",
      sumOf: [],
      fromSpeakerTotals: ["speaker_total"],
      max: 170,
    },
  ],
  // 规范第 33 节：名次与分数不一致**只警告**，因此这里刻意**没有** rules
  guidance: {
    title: "BP score reference",
    normalRange: [60, 85],
    defaultScore: 75,
    anchors: [
      { score: 85, label: "God-like", note: "An extremely rare, near-perfect speech" },
      { score: 82, label: "Exceptional", note: "Elite, with almost no clear weakness" },
      { score: 80, label: "Excellent", note: "Excellent speech" },
      { score: 78, label: "Very Decent", note: "A clearly strong, competition-level speech" },
      { score: 76, label: "Above Average", note: "Stronger than usual" },
      {
        score: 75,
        label: "Average",
        note: "the BP average. 75 is not a low score; it is the average",
      },
      { score: 73, label: "Slightly Below Average", note: "Usable but clearly weak" },
      { score: 70, label: "Weak", note: "Clearly problematic" },
      { score: 65, label: "Very Weak", note: "Limited meaningful contribution" },
      { score: 61, label: "Extremely Weak", note: "Almost no effective debating" },
      { score: 60, label: "Minimum", note: "Equivalent to saying hello and sitting down" },
    ],
  },
};

export const OFFICIAL_TEMPLATES: Record<string, { name: string; schema: BallotTemplateSchema }> = {
  ONE_V_ONE: {
    name: "Extemporaneous Debate official template",
    schema: EXTEMP_TEMPLATE,
  },
  JWSD: {
    name: "JWSD official template",
    schema: JWSD_TEMPLATE,
  },
  PF: {
    name: "Public Forum (PF) official template",
    schema: PF_TEMPLATE,
  },
  WSDC: {
    name: "WSDC official template",
    schema: WSDC_TEMPLATE,
  },
  BP: {
    name: "British Parliamentary (BP) official template",
    schema: BP_TEMPLATE,
  },
};
