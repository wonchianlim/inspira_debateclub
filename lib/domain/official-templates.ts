import type { BallotTemplateSchema } from "@/lib/domain/ballot-schema";

/** 两个作用范围的简写，让下面的模板定义读起来短一些。 */
const TEAM_SCOPE = "team" as const;
const MATCH_SCOPE = "match" as const;

/**
 * **官方评分表模板**（由产品负责人提供）。
 *
 * ⚠️ 这里是模板的**唯一来源**：测试与"载入官方模板"的动作都引用它。
 * 若把同样的内容在测试与生产代码里各写一份，两边迟早会漂移 ——
 * 而"测试通过、实际生效的是另一份"正是本项目反复在防的那类问题。
 *
 * 规范没有规定这些内容，**是产品负责人给的**：
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
      label: "论证",
      type: "score",
      scope: TEAM_SCOPE,
      required: true,
      min: 0,
      max: 10,
    },
    {
      key: "engagement",
      label: "交锋",
      type: "score",
      scope: TEAM_SCOPE,
      required: true,
      min: 0,
      max: 8,
    },
    {
      key: "analysis_adaptability",
      label: "分析与应变",
      type: "score",
      scope: TEAM_SCOPE,
      required: true,
      min: 0,
      max: 6,
    },
    {
      key: "delivery",
      label: "表达",
      type: "score",
      scope: TEAM_SCOPE,
      required: true,
      min: 0,
      max: 4,
    },
    {
      key: "structure_strategy",
      label: "结构与策略",
      type: "score",
      scope: TEAM_SCOPE,
      required: true,
      min: 0,
      max: 2,
    },

    // ---- Ballot 第 1、2 部分：正反方主要论点 ----
    // `scope: team` 让**一支队伍一份列表**，天然对应规范里
    // "Proposition Main Arguments" 与 "Opposition Main Arguments" 两节。
    {
      key: "main_arguments",
      label: "主要论点",
      type: "list",
      scope: TEAM_SCOPE,
      required: true,
      minItems: 1,
      maxItems: 5,
      itemLabel: "论点",
    },

    // ---- Ballot 第 3 部分：主要交锋（不按方，整场一份）----
    {
      key: "main_clashes",
      label: "主要交锋",
      type: "list",
      scope: MATCH_SCOPE,
      required: true,
      minItems: 1,
      maxItems: 5,
      itemLabel: "交锋",
    },

    // ---- Ballot 第 4 部分：判决理由（至少 100 字，规范第 19 节）----
    {
      key: "reason_for_decision",
      label: "判决理由",
      type: "text",
      scope: MATCH_SCOPE,
      required: true,
      minLength: 100,
    },

    // ---- 裁判信心（3 档，可选，规范第 14 节）----
    {
      key: "judge_confidence",
      label: "裁判信心",
      type: "score",
      scope: MATCH_SCOPE,
      required: false,
      min: 1,
      max: 3,
      options: [
        { value: 3, label: "清晰判决" },
        { value: 2, label: "势均力敌" },
        { value: 1, label: "非常接近" },
      ],
    },

    // ---- Ballot 第 5、6 部分：正反方反馈（各两项，至少 30 字，规范第 22、23 节）----
    {
      key: "feedback_strength",
      label: "做得好的地方",
      type: "text",
      scope: TEAM_SCOPE,
      required: true,
      minLength: 30,
    },
    {
      key: "feedback_improve",
      label: "应该改进的地方",
      type: "text",
      scope: TEAM_SCOPE,
      required: true,
      minLength: 30,
    },
  ],
  winnerRequired: true,
  reasonForDecisionRequired: true,
  // 规范第 40 节：总分由五项相加，满分 30，**裁判不填**
  totals: [
    {
      key: "total",
      label: "总分",
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
   * **胜方的队伍总分必须高于对方**。因此在这里是**硬规则**（阻止提交），
   * 而不是软警告。
   */
  rules: [
    {
      kind: "totalsMustNotTie",
      totalKey: "total",
      message: "两队的队伍总分相同，不能提交。请调整分数，让胜方的队伍总分更高。",
    },
    {
      kind: "winnerMustHaveHighestTotal",
      totalKey: "total",
      message:
        "你选的胜方队伍总分低于对方。本赛制不允许 Low Point Win（低分获胜），" +
        "请调整分数或改选胜方后再提交。",
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
      label: "表达",
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
      label: "内容",
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
      label: "策略",
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
     * 表达 20 / 内容 20 / 策略 10 —— 正好是 40/40/20 的一半。
     *
     * ⚠️ 产品负责人明确：**回复发言者允许半分**（例如 35.5），因此 `step: 0.5`。
     */
    {
      key: "reply_style",
      label: "表达（回复）",
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
      label: "内容（回复）",
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
      label: "策略（回复）",
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
      scope: TEAM_SCOPE,
      required: true,
      minItems: 1,
      maxItems: 5,
      itemLabel: "论点",
      itemFields: [{ key: "judge_note", label: "裁判笔记", required: false }],
    },

    // ---- 交锋：整场一份，每条可带三段笔记（规范第 20–22 节，MVP 里可选）----
    {
      key: "main_clashes",
      label: "主要交锋",
      type: "list",
      scope: MATCH_SCOPE,
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
      scope: MATCH_SCOPE,
      required: true,
      minLength: 100,
    },

    // ---- 裁判信心（规范第 26 节，可选）----
    {
      key: "judge_confidence",
      label: "裁判信心",
      type: "score",
      scope: MATCH_SCOPE,
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
      scope: TEAM_SCOPE,
      required: true,
      minLength: 30,
    },
    {
      key: "feedback_improve",
      label: "应该改进的地方",
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
      label: "个人总分",
      scope: "speaker",
      sumOf: ["style", "content", "strategy"],
      max: 100,
      perSpeaker: true,
    },
    // 回复发言者：50 分（普通发言者的一半），**允许半分**
    {
      key: "reply_total",
      label: "回复总分",
      scope: "speaker",
      sumOf: ["reply_style", "reply_content", "reply_strategy"],
      max: 50,
      perSpeaker: true,
    },
    /*
     * 队伍总分 = 三位普通发言者 + 一位回复发言者。
     *
     * ⚠️ 满分**不写死**：人数与构成可变（3 人、4 人、加不加回复发言者），
     * 因此只做一个下界检查（至少 100 + 50 = 150）。
     * 因为回复项允许半分，队伍总分**也可能带半分**（例如 257.5）。
     */
    {
      key: "team_total",
      label: "队伍总分",
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
   * **胜方的队伍总分必须高于对方**。因此在这里是**硬规则**（阻止提交），
   * 而不是软警告。
   */
  rules: [
    {
      kind: "totalsMustNotTie",
      totalKey: "team_total",
      message: "两队的队伍总分相同，不能提交。请调整分数，让胜方的队伍总分更高。",
    },
    {
      kind: "winnerMustHaveHighestTotal",
      totalKey: "team_total",
      message:
        "你选的胜方队伍总分低于对方。本赛制不允许 Low Point Win（低分获胜），" +
        "请调整分数或改选胜方后再提交。",
    },
    {
      /*
       * 产品负责人 2026-09-29：**WSDC 与 JWSD 的队伍总分差必须在 0.5–12 分之间**。
       *
       *   - 下界 0.5：不能平局（这两个赛制允许半分，0.5 就是最小差距）
       *   - 上界 12：不能一边倒得太离谱 —— 那通常说明打分出了问题
       */
      kind: "teamTotalGapWithinRange",
      totalKey: "team_total",
      minGap: 0.5,
      maxGap: 12,
      message:
        "两队队伍总分的差距必须在 0.5 到 12 分之间。差得太少说明几乎平局，" +
        "差得太多通常说明打分有问题 —— 请检查发言者分数后再提交。",
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
 * 只包含**产品负责人已经给出内容**的赛制。
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
      label: "论证与证据",
      type: "score",
      scope: "speaker",
      required: true,
      min: 0,
      max: 10,
      step: 0.5,
    },
    {
      key: "rebuttal",
      label: "反驳与比较",
      type: "score",
      scope: "speaker",
      required: true,
      min: 0,
      max: 8,
      step: 0.5,
    },
    {
      key: "strategy",
      label: "策略与全局意识",
      type: "score",
      scope: "speaker",
      required: true,
      min: 0,
      max: 6,
      step: 0.5,
    },
    {
      key: "delivery",
      label: "表达",
      type: "score",
      scope: "speaker",
      required: true,
      min: 0,
      max: 4,
      step: 0.5,
    },
    {
      key: "crossfire_teamwork",
      label: "交叉质询与配合",
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
      label: "这位发言者可以改进的一点",
      type: "text",
      scope: "speaker",
      required: false,
      minLength: 10,
    },

    // ---- 论点（规范第 24–26 节）----
    {
      key: "main_arguments",
      label: "主要论点",
      type: "list",
      scope: TEAM_SCOPE,
      required: true,
      minItems: 1,
      maxItems: 5,
      itemLabel: "论点",
      itemFields: [{ key: "judge_note", label: "裁判笔记", required: false }],
    },

    // ---- 交锋（规范第 27–29 节）----
    {
      key: "main_clashes",
      label: "主要交锋",
      type: "list",
      scope: MATCH_SCOPE,
      required: true,
      minItems: 1,
      maxItems: 5,
      itemLabel: "交锋",
      itemFields: [
        { key: "pro_note", label: "正方立场", required: false },
        { key: "con_note", label: "反方立场", required: false },
        { key: "judge_assessment", label: "裁判评估", required: false },
      ],
    },

    // ---- 判决理由（规范第 30、32 节）----
    {
      key: "reason_for_decision",
      label: "判决理由",
      type: "text",
      scope: MATCH_SCOPE,
      required: true,
      minLength: 100,
    },

    // ---- 裁判信心（规范第 34 节）----
    {
      key: "judge_confidence",
      label: "裁判信心",
      type: "score",
      scope: MATCH_SCOPE,
      required: false,
      min: 1,
      max: 3,
      options: [
        { value: 3, label: "清晰" },
        { value: 2, label: "有竞争性" },
        { value: 1, label: "非常接近" },
      ],
    },

    // ---- 队伍反馈（规范第 35、36 节）----
    {
      key: "feedback_strength",
      label: "做得好的地方",
      type: "text",
      scope: TEAM_SCOPE,
      required: true,
      minLength: 30,
    },
    {
      key: "feedback_improve",
      label: "应该改进的地方",
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
      label: "个人总分",
      scope: "speaker",
      sumOf: ["argumentation", "rebuttal", "strategy", "delivery", "crossfire_teamwork"],
      max: 30,
      perSpeaker: true,
      // 规范第 49 节：高于 29 或低于 22 都只是**提示**，裁判确认后可以继续
      confirmAbove: 29,
      confirmBelow: 22,
    },
    // 队伍总分 = 两位发言者之和，满分 60（规范第 2、21 节）
    {
      key: "team_points",
      label: "队伍总分",
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
        "两队的队伍总分相同，不能提交。因为允许半分，请调整发言者分数，让胜方的队伍总分更高。",
    },
    {
      kind: "winnerMustHaveHighestTotal",
      totalKey: "team_points",
      message:
        "你选的胜方队伍总分低于对方。Public Forum 不允许 Low Point Win（低分获胜），" +
        "请调整分数或改选胜方后再提交。",
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
      label: "表达",
      type: "score",
      scope: "speaker",
      required: true,
      min: 0,
      max: 40,
      step: 1,
    },
    {
      key: "content",
      label: "内容",
      type: "score",
      scope: "speaker",
      required: true,
      min: 0,
      max: 40,
      step: 1,
    },
    {
      key: "strategy",
      label: "策略",
      type: "score",
      scope: "speaker",
      required: true,
      min: 0,
      max: 20,
      step: 1,
    },

    // 每位发言者可选的单独评语（规范第 29 节）
    {
      key: "speaker_feedback",
      label: "这位发言者可以改进的一点",
      type: "text",
      scope: "speaker",
      required: false,
      minLength: 10,
    },

    // ---- 论点（规范第 17–19 节）----
    {
      key: "main_arguments",
      label: "主要论点",
      type: "list",
      scope: TEAM_SCOPE,
      required: true,
      minItems: 1,
      maxItems: 5,
      itemLabel: "论点",
      itemFields: [{ key: "judge_note", label: "裁判笔记", required: false }],
    },

    // ---- 交锋（规范第 20–22 节）----
    {
      key: "main_clashes",
      label: "主要交锋",
      type: "list",
      scope: MATCH_SCOPE,
      required: true,
      minItems: 1,
      maxItems: 5,
      itemLabel: "交锋",
      itemFields: [
        { key: "proposition_note", label: "正方立场", required: false },
        { key: "opposition_note", label: "反方立场", required: false },
        { key: "judge_assessment", label: "裁判评估", required: false },
      ],
    },

    // ---- 判决理由（规范第 23、25 节）----
    {
      key: "reason_for_decision",
      label: "判决理由",
      type: "text",
      scope: MATCH_SCOPE,
      required: true,
      minLength: 100,
    },

    // ---- 裁判信心（规范第 26 节）----
    {
      key: "judge_confidence",
      label: "裁判信心",
      type: "score",
      scope: MATCH_SCOPE,
      required: false,
      min: 1,
      max: 3,
      options: [
        { value: 3, label: "清晰判决" },
        { value: 2, label: "有竞争性" },
        { value: 1, label: "非常接近" },
      ],
    },

    // ---- 队伍反馈（规范第 27、28 节：**必填**）----
    {
      key: "feedback_strength",
      label: "做得好的地方",
      type: "text",
      scope: TEAM_SCOPE,
      required: true,
      minLength: 30,
    },
    {
      key: "feedback_improve",
      label: "应该改进的地方",
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
      label: "个人总分",
      scope: "speaker",
      sumOf: ["style", "content", "strategy"],
      max: 100,
      perSpeaker: true,
      /*
       * ⚠️ 产品负责人明确：**WSDC 的个人总分必须在 60–80 之间，
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
    // 队伍总分 = 三位主发言者之和，满分 300（规范第 13 节）
    {
      key: "team_total",
      label: "队伍总分",
      scope: "teamFromSpeakers",
      sumOf: [],
      fromSpeakerTotals: ["speaker_total"],
      max: 300,
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
      message: "两队的队伍总分相同，不能提交。请调整分数，让胜方的队伍总分更高。",
    },
    {
      kind: "winnerMustHaveHighestTotal",
      totalKey: "team_total",
      message:
        "你选的胜方队伍总分低于对方。本赛制不允许 Low Point Win（低分获胜），" +
        "请调整分数或改选胜方后再提交。",
    },
    {
      /*
       * 产品负责人 2026-09-29：**WSDC 与 JWSD 的队伍总分差必须在 0.5–12 分之间**。
       *
       *   - 下界 0.5：不能平局（这两个赛制允许半分，0.5 就是最小差距）
       *   - 上界 12：不能一边倒得太离谱 —— 那通常说明打分出了问题
       */
      kind: "teamTotalGapWithinRange",
      totalKey: "team_total",
      minGap: 0.5,
      maxGap: 12,
      message:
        "两队队伍总分的差距必须在 0.5 到 12 分之间。差得太少说明几乎平局，" +
        "差得太多通常说明打分有问题 —— 请检查发言者分数后再提交。",
    },
  ],
  guidance: {
    title: "WSDC 评分参照",
    normalRange: [60, 80],
    defaultScore: 70,
    anchors: [
      { score: 80, label: "God-like", note: "近乎完美的演讲，极其罕见" },
      { score: 78, label: "Exceptional", note: "精英竞赛级别的出色表现，非常罕见" },
      { score: 76, label: "Excellent", note: "真正优秀的演讲，几乎没有明显弱点" },
      { score: 75, label: "Very Decent", note: "明显强于一般水平，是一篇很好的演讲" },
      { score: 73, label: "Strong", note: "高于平均，分析、策略与表达都不错" },
      { score: 71, label: "Above Average", note: "扎实的演讲，明显好于常规水平" },
      { score: 70, label: "Average", note: "WSDC 的平均水平。70 不是惩罚，它就是平均" },
      { score: 68, label: "Below Average", note: "基本可用，但在分析、策略或表达上有明显弱点" },
      { score: 66, label: "Weak", note: "问题明显，但仍有一定辩论内容" },
      { score: 63, label: "Very Weak", note: "各方面都有重大弱点，有效贡献有限" },
      { score: 61, label: "Extremely Weak", note: "几乎没有提出有意义的辩论内容" },
      { score: 60, label: "Minimum", note: "相当于上台问好就坐下" },
    ],
  },
};

export const OFFICIAL_TEMPLATES: Record<string, { name: string; schema: BallotTemplateSchema }> = {
  ONE_V_ONE: {
    name: "即兴辩论（Extemporaneous Debate）官方模板",
    schema: EXTEMP_TEMPLATE,
  },
  JWSD: {
    name: "JWSD 官方模板",
    schema: JWSD_TEMPLATE,
  },
  PF: {
    name: "Public Forum（PF）官方模板",
    schema: PF_TEMPLATE,
  },
  WSDC: {
    name: "WSDC 官方模板",
    schema: WSDC_TEMPLATE,
  },
};
