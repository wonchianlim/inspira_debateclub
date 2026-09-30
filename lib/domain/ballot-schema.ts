/**
 * 评分表模板的 schema（主规格第 6.6 节）。
 *
 * 规范原文：
 *   "Do **not** create five unrelated ballot systems. Use shared tables plus a
 *    **versioned format-specific schema**."
 *   "The JSON schema describes format-specific fields and required validation.
 *    It is **configuration**, not a dumping ground for all ballot data."
 *
 * -----------------------------------------------------------------------------
 * ⚠️ 这里有一个**我做的设计决定**，必须写清楚
 *
 * 规范说了"用版本化的 JSON schema 描述字段与校验"，但**没有规定这个 schema 的形状**。
 * 因此下面这套结构是我设计的，**产品负责人可以推翻**：
 *
 *   - 每个字段有 `key`（存储用的键）、`label`（界面显示的中文名）、`type`、`scope`；
 *   - `scope` 决定值存在哪里，对应规范给的三张表：
 *       `speaker` → `ballot_scores`（按学生逐项打分）
 *       `match`   → `ballots.format_data`（整场一个值，例如"这场比赛的评语"）
 *       `team`    → `ballots.format_data`（按队伍一个值）
 *   - `required` / `min` / `max` 描述校验。
 *
 * **为什么这样设计很重要：** 它意味着**五种赛制的具体评分项是"数据"而不是"代码"**。
 * 因此我不需要（也不应该）替产品负责人编造"WSDC 应该打哪几项、每项多少分" ——
 * 那由超级管理员在界面上配置成模板。规范里 `ballot_scores` 的
 * "WSDC content/style/strategy/total、PF speaker_points、BP speaker_score"
 * 只是**举例**，不是穷举，也不是唯一正确的答案。
 *
 * ⚠️ 本模块只做**形状与取值**的校验；"某一项分数该不该是 30 分"这类**辩论领域**的
 * 判断不在代码里，而在模板配置里 —— 那是产品负责人的决定。
 */

/** 字段类型。 */
export const BALLOT_FIELD_TYPES = ["score", "text", "boolean", "list"] as const;
export type BallotFieldType = (typeof BALLOT_FIELD_TYPES)[number];

/** 字段作用于谁 —— 决定值存在哪张表/哪一列（见文件头说明）。 */
export const BALLOT_FIELD_SCOPES = ["speaker", "team", "match"] as const;
export type BallotFieldScope = (typeof BALLOT_FIELD_SCOPES)[number];

export type BallotField = {
  /** 存储用的键，例如 `content`、`speaker_points` */
  key: string;
  /** 界面上显示的名称（中文） */
  label: string;
  type: BallotFieldType;
  scope: BallotFieldScope;
  required: boolean;
  /** 仅 `score` 有意义 */
  min?: number;
  max?: number;
  /**
   * 仅 `score` 有意义：**允许的最小刻度**（默认 1，即必须是整数）。
   *
   * JWSD 的规则是"前三位发言者只能打整数，回复发言者允许半分"，
   * 因此前者的字段 `step: 1`、后者的字段 `step: 0.5`。
   * 这一项是**硬校验**：打 70.5 到整数位字段上会被拒绝。
   */
  step?: number;
  /**
   * 仅 `score` 有意义：每个分档的中文说明。
   *
   * 即兴辩论的"裁判信心"是 1/2/3 三个档位，每一档都要有文字
   * （清晰判决 / 势均力敌 / 非常接近）—— 光有数字裁判不知道 2 是什么意思。
   */
  options?: { value: number; label: string }[];
  /**
   * 仅 `text` 有意义：**建议**的最少字数（判决理由建议 100 字、反馈建议 30 字）。
   *
   * ⚠️ 这是**软阈值**，不是硬要求。规范第 19、22 节的措辞都是 "Recommended minimum"，
   * 而且第 20 节明确说 "Do **not** block submission solely based on writing quality."
   * 因此它只在 `findBallotWarnings()` 里产生提示，**不**进 `validateBallotData()`。
   *
   * （我第一版把它当成了硬要求，测试立刻暴露出来：短理由被拒绝提交，
   *   而规范要求的是"提示但允许提交"。）
   */
  minLength?: number;
  /** 最多字数 —— 这一项是**硬**上限（技术限制，不是写作质量判断） */
  maxLength?: number;
  /** 仅 `list` 有意义：条目数量限制与每条的提示 */
  minItems?: number;
  maxItems?: number;
  itemLabel?: string;
  /**
   * 仅 `scope: "speaker"` 有意义：**只对这些发言位次生效**（1 起）。
   *
   * JWSD 的回复发言者（第 4 位）只打一半的分，用的字段也与前三位不同。
   * 不填这个属性时，字段对**所有**发言者生效。
   */
  speakerPositions?: number[];
  /**
   * 仅 `list` 有意义：**每条可带哪些子字段**。
   *
   * JWSD 规范里每条论点可带一个「裁判笔记」，每条交锋可带
   * 「正方主张 / 反方主张 / 裁判评估」三段笔记。
   * 不填这个属性时，条目就是纯文字（1v1 的论点与交锋就是这种）。
   */
  itemFields?: BallotListItemField[];
  /** 给裁判的说明 */
  help?: string;
};

/**
 * 结构化列表条目的子字段（例如论点的"裁判笔记"）。
 *
 * 刻意只支持文字：规范里这些子字段全是记录性文字，没有分数或选项。
 * 若将来需要别的类型，再按需要扩展 —— 现在多加类型只会让界面更难用。
 */
export type BallotListItemField = {
  key: string;
  label: string;
  required: boolean;
  /** 建议的最少字数（软阈值，与顶层文字字段同一语义） */
  minLength?: number;
};

/**
 * **计算总项**：由若干分数字段相加得出，裁判**不填**。
 *
 * 即兴辩论的总分是五个维度之和（满分 30），规范明确要求
 * "The total should calculate automatically. Judges should not manually enter the total."
 *
 * 刻意**不把它存进数据库**：总分是别的字段的纯函数，
 * 存下来就会有"总分与分项不一致"的可能 —— 那正是要避免的。
 * 因此它在读取与提交时计算。
 */
export type BallotTotal = {
  key: string;
  label: string;
  /**
   * - `team`：把**该队伍自己的**若干字段相加（1v1 的 30 分是这种）
   * - `speaker`：把**该学生自己的**若干字段相加（JWSD 每人的 100 分是这种）
   * - `teamFromSpeakers`：把**该队伍每位发言者的某个总项**相加
   *   （JWSD 的队伍总分 = 三位发言者总分之和）
   */
  scope: "team" | "speaker" | "teamFromSpeakers";
  /** 由哪些字段相加；`teamFromSpeakers` 时不用 */
  sumOf: string[];
  /**
   * 仅 `teamFromSpeakers`：把发言者的**哪些**总项相加。
   *
   * 用数组而不是单个键，是因为 JWSD 有两类发言者：
   * 前三位每人满分 100，回复发言者满分 50 —— 队伍总分要把两者都算进去。
   */
  fromSpeakerTotals?: string[];
  /** 满分，用于显示 `/30` 或 `/100` */
  max: number;
  /** 是否是"每位发言者都要有的"总项（用于界面按人显示） */
  perSpeaker?: boolean;
  /**
   * 高于这个总分时提示"请确认这确实是异常出色"（**软警告**）。
   *
   * ⚠️ 这是**总分**上的确认区间，不是单个维度的。
   * PF 规范第 49 节说的是"This speaker received a score above 29" —— 即个人总分。
   */
  confirmAbove?: number;
  /** 低于这个总分时提示确认（软警告）。 */
  confirmBelow?: number;
  /**
   * **硬性**最低总分 —— 低于它**不能提交**。
   *
   * ⚠️ 与 `confirmBelow` 的区别是性质，不是程度：
   *   - `confirmBelow` 只是"请确认"，裁判确认后可以继续；
   *   - `hardMin` 是**拒绝**，不可覆盖。
   *
   * WSDC 规范明确要求"system should reject 59 / 81"，
   * 因此那里的 60 是 `hardMin`，不是建议。
   */
  hardMin?: number;
  /** **硬性**最高总分 —— 高于它不能提交。 */
  hardMax?: number;
};

/**
 * **跨字段硬规则**：引用计算结果（总项）来约束整份评分表。
 *
 * 为什么需要单独一类规则：
 *   - 1v1 与 JWSD 里"胜方分数明显偏低"只是**软警告**（规范明说不得阻止提交）；
 *   - 而 PF 规范第 3、4、22、48 节把它定成**硬规则**：
 *     "No Low Point Wins" 与"不能平局"，**不可覆盖**，必须阻止提交。
 *
 * 同一个现象在两个赛制里性质相反，因此**不能写死在代码里** ——
 * 它必须是模板的配置项。
 */
export type BallotCrossFieldRule =
  | {
      /** 胜方必须是总项最高的那一方（PF：不允许 Low Point Win） */
      kind: "winnerMustHaveHighestTotal";
      /** 引用哪个队伍级总项 */
      totalKey: string;
      /** 违反时的提示（中文，直接显示给裁判） */
      message: string;
    }
  | {
      /** 队伍总项不能相同（PF：不允许平局） */
      kind: "totalsMustNotTie";
      totalKey: string;
      message: string;
    }
  | {
      /**
       * 两队总项之差必须落在一个区间内。
       *
       * WSDC 与 JWSD 的硬规则：**差不能超过 12 分，也不能少于 0.5 分**。
       * 下界 0.5 意味着"不能平局"（在允许半分的赛制里，0.5 就是最小差距）；
       * 上界 12 意味着"不能一边倒得太离谱"——那通常说明打分出了问题。
       */
      kind: "teamTotalGapWithinRange";
      totalKey: string;
      minGap: number;
      maxGap: number;
      message: string;
    };

export type BallotTemplateSchema = {
  /** **schema 格式本身**的版本，与 `ballot_templates.version`（模板版本）不是一回事 */
  schemaVersion: 1;
  fields: BallotField[];
  /** 是否必须选出胜方 */
  winnerRequired: boolean;
  /** 是否必须填写判决理由 */
  reasonForDecisionRequired: boolean;
  /** 计算总项（可选）。总项不存数据库，读取与提交时计算。 */
  totals?: BallotTotal[];
  /**
   * 跨字段**硬**规则（可选）。违反即**阻止提交**，且按规范不可覆盖。
   * 与软警告的区别见 `BallotCrossFieldRule` 的说明。
   */
  rules?: BallotCrossFieldRule[];
  /**
   * 给裁判的**评分参照表**（可选）。
   *
   * WSDC 规范明确要求："the scoring interface should display the following
   * reference beside or underneath the score fields... This guide should
   * remain visible while judges score speakers."
   *
   * 因此它是模板的一部分，而不是写死在界面里的文字 ——
   * 不同赛制的参照标准不同。
   */
  guidance?: {
    title: string;
    /** 常规区间，用于提示 */
    normalRange?: [number, number];
    /** 界面上的默认参照点 */
    defaultScore?: number;
    /** 锚点：分数 → 名称 → 说明 */
    anchors: { score: number; label: string; note?: string }[];
  };
};

export type BallotValidationIssue = {
  /** 出问题的字段键；整表级问题时为空 */
  fieldKey?: string;
  message: string;
};

export type BallotValidationResult = {
  valid: boolean;
  issues: BallotValidationIssue[];
};

/** key 只允许小写字母、数字与下划线 —— 它会被当作数据库里的文本键使用。 */
const KEY_PATTERN = /^[a-z][a-z0-9_]*$/;

/**
 * 校验**模板 schema 本身**是否合法。
 *
 * 这一步很重要：模板是**由人配置**的，配置错了会让所有裁判都打不了分。
 * 因此在保存模板时就必须拦住，而不是等到裁判填表时才发现。
 */
export function validateBallotTemplate(schema: BallotTemplateSchema): BallotValidationResult {
  const issues: BallotValidationIssue[] = [];

  if (schema.schemaVersion !== 1) {
    issues.push({ message: `不支持的 schema 版本：${String(schema.schemaVersion)}` });
  }

  if (!Array.isArray(schema.fields) || schema.fields.length === 0) {
    issues.push({ message: "评分表至少要有一个字段。" });
    return { valid: false, issues };
  }

  const seenKeys = new Set<string>();
  for (const field of schema.fields) {
    if (!KEY_PATTERN.test(field.key)) {
      issues.push({
        fieldKey: field.key,
        message: `字段键 "${field.key}" 不合法：只能用小写字母开头、包含小写字母/数字/下划线。`,
      });
    }
    if (seenKeys.has(field.key)) {
      issues.push({ fieldKey: field.key, message: `字段键 "${field.key}" 重复了。` });
    }
    seenKeys.add(field.key);

    if (field.label.trim() === "") {
      issues.push({ fieldKey: field.key, message: `字段 "${field.key}" 缺少显示名称。` });
    }

    if (!BALLOT_FIELD_TYPES.includes(field.type)) {
      issues.push({ fieldKey: field.key, message: `字段 "${field.key}" 的类型无法识别。` });
    }
    if (!BALLOT_FIELD_SCOPES.includes(field.scope)) {
      issues.push({ fieldKey: field.key, message: `字段 "${field.key}" 的作用范围无法识别。` });
    }

    if (field.type === "list") {
      if (typeof field.minItems !== "number" || typeof field.maxItems !== "number") {
        issues.push({
          fieldKey: field.key,
          message: `列表字段 "${field.key}" 必须给出最少与最多条目数。`,
        });
      } else if (field.minItems < 0 || field.maxItems < field.minItems) {
        issues.push({
          fieldKey: field.key,
          message: `列表字段 "${field.key}" 的条目数范围不合法（最少 ${field.minItems}、最多 ${field.maxItems}）。`,
        });
      }
      if (field.scope === "speaker") {
        // 规范里的"论点""交锋"都是按方或整场，而不是按某位学生
        issues.push({
          fieldKey: field.key,
          message: `列表字段 "${field.key}" 不能按学生 —— 请用「按队伍」或「整场」。`,
        });
      }
    }

    if (field.type === "text" && typeof field.minLength === "number" && field.minLength < 0) {
      issues.push({ fieldKey: field.key, message: `文字字段 "${field.key}" 的最少字数不能为负。` });
    }

    if (field.type === "score" && field.step !== undefined && field.step <= 0) {
      issues.push({ fieldKey: field.key, message: `分数字段 "${field.key}" 的刻度必须大于 0。` });
    }

    if (field.speakerPositions && field.scope !== "speaker") {
      issues.push({
        fieldKey: field.key,
        message: `字段 "${field.key}" 指定了发言位次，但它不是「按学生」的字段。`,
      });
    }

    if (field.type === "score" && field.options) {
      // 分档说明只对分数有意义，且每一档都要有值
      const badOption = field.options.find(
        (option) => typeof option.value !== "number" || option.label.trim() === "",
      );
      if (badOption) {
        issues.push({
          fieldKey: field.key,
          message: `分数字段 "${field.key}" 的分档说明不完整（每一档都要有数值与文字）。`,
        });
      }
    }

    if (field.type === "score") {
      if (typeof field.min !== "number" || typeof field.max !== "number") {
        /*
         * 分数区间**必须由配置的人给出**。
         * 规范里 ballot_scores.score_value 是 NUMERIC，没有规定区间；
         * 我不能替产品负责人决定"满分是 30 还是 100"。
         */
        issues.push({
          fieldKey: field.key,
          message: `分数字段 "${field.key}" 必须给出最小值和最大值（这是各赛制的评分区间，不能由系统替你决定）。`,
        });
      } else if (field.min > field.max) {
        issues.push({
          fieldKey: field.key,
          message: `分数字段 "${field.key}" 的最小值大于最大值。`,
        });
      }
    }
  }

  // 计算总项：必须是已存在的分数字段之和
  for (const total of schema.totals ?? []) {
    if (total.scope === "teamFromSpeakers") {
      const fromKeys = total.fromSpeakerTotals ?? [];
      if (fromKeys.length === 0) {
        issues.push({ message: `总项 "${total.label}" 没有说明由发言者的哪些总项相加。` });
        continue;
      }
      const referenced = fromKeys.map((key) =>
        (schema.totals ?? []).find(
          (candidate) => candidate.key === key && candidate.scope === "speaker",
        ),
      );
      const missing = fromKeys.filter((_, index) => referenced[index] === undefined);
      if (missing.length > 0) {
        issues.push({
          message: `总项 "${total.label}" 引用的发言者总项 ${missing.join("、")} 不存在或不是发言者级的。`,
        });
        continue;
      }

      /*
       * 队伍总分满分**不能静态写死**：它取决于该队有几位发言者、以及
       * 各是什么类型（JWSD 是"三位满分 100 + 一位满分 50"）。
       * 因此这里只做一个**下界**检查：至少要有每位被引用总项的一份 ——
       * 满分比这个还小，说明配置一定错了。
       */
      const minimumMax = referenced.reduce((sum, entry) => sum + (entry?.max ?? 0), 0);
      if (total.max < minimumMax) {
        issues.push({
          message: `总项 "${total.label}" 的满分 ${total.max} 小于各项每人满分之和 ${minimumMax}，配置有误。`,
        });
      }
      continue;
    }
    const referenced = total.sumOf
      .map((key) => schema.fields.find((field) => field.key === key))
      .filter((field): field is BallotField => field !== undefined);

    if (referenced.length !== total.sumOf.length) {
      issues.push({
        message: `总项 "${total.label}" 引用了不存在的字段。`,
      });
      continue;
    }
    const nonScore = referenced.filter((field) => field.type !== "score");
    if (nonScore.length > 0) {
      issues.push({
        message: `总项 "${total.label}" 只能由分数字段相加，但引用了：${nonScore
          .map((field) => field.key)
          .join("、")}。`,
      });
    }
    const expectedMax = referenced.reduce((sum, field) => sum + (field.max ?? 0), 0);
    if (Math.abs(expectedMax - total.max) > 0.001) {
      /*
       * 总项的满分必须等于各分项满分之和。
       * 不一致会让界面显示"/30"而实际最多只能打 28 分 —— 那种错误很难现场发现。
       */
      issues.push({
        message: `总项 "${total.label}" 的满分是 ${total.max}，但各分项之和是 ${expectedMax}，两者必须一致。`,
      });
    }
  }

  return { valid: issues.length === 0, issues };
}

/** 一位被评者的取值。 */
/** 列表字段的值是字符串数组；其余是标量。 */
/**
 * 列表字段的值有两种形态：
 *   - `string[]` —— 纯文字条目（1v1 的论点、交锋）
 *   - `Record<string, string>[]` —— 带子字段的条目（JWSD 的论点+裁判笔记、交锋三段笔记）
 */
export type BallotListEntry = string | Record<string, string>;

export type BallotValue = number | string | boolean | BallotListEntry[] | null | undefined;

/** 一份评分表的数据（提交上来或从数据库读出来的）。 */
export type BallotData = {
  /** 按学生：`studentId` → `字段键` → 值 */
  speakerValues: Record<string, Record<string, BallotValue>>;
  /** 按队伍：`teamId` → `字段键` → 值 */
  teamValues: Record<string, Record<string, BallotValue>>;
  /** 整场一个值：`字段键` → 值 */
  matchValues: Record<string, BallotValue>;
};

export function emptyBallotData(): BallotData {
  return { speakerValues: {}, teamValues: {}, matchValues: {} };
}

function isBlank(value: BallotValue): boolean {
  return (
    value === null || value === undefined || (typeof value === "string" && value.trim() === "")
  );
}

/**
 * 用模板 schema 校验一份评分表数据。
 *
 * @param schema      模板
 * @param data        数据
 * @param expectedIds 本场**应该被打分**的对象 id（学生 id 与队伍 id）。
 *                    传入它是为了发现"漏打某个人" —— 只校验已填的人是不够的。
 */
export function validateBallotData(
  schema: BallotTemplateSchema,
  data: BallotData,
  expectedIds?: {
    studentIds?: readonly string[];
    teamIds?: readonly string[];
    /**
     * 学生 id → 发言位次（1 起）。
     *
     * 只在模板里出现 `speakerPositions` 时才需要：
     * JWSD 的回复发言者（第 4 位）用另一组字段，不该被要求填前三位那组。
     */
    speakerPositionByStudent?: Record<string, number>;
  },
): BallotValidationResult {
  const issues: BallotValidationIssue[] = [];

  for (const field of schema.fields) {
    if (field.scope === "match") {
      const value = data.matchValues[field.key];
      if (field.required && isBlank(value)) {
        issues.push({ fieldKey: field.key, message: `"${field.label}" 必须填写。` });
        continue;
      }
      if (!isBlank(value)) issues.push(...checkValueType(field, value));
      continue;
    }

    const bucket = field.scope === "speaker" ? data.speakerValues : data.teamValues;

    /*
     * 这个字段该管哪些人。
     *
     * `speakerPositions` 让一个字段只对某些发言位次生效 ——
     * JWSD 的前三位（100 分制）与回复发言者（50 分制）用的字段不同。
     *
     * ⚠️ 位次**未知**的学生**不会被跳过**：宁可多校验一个人，
     *    也不该因为缺一条位次信息就静默放过。
     */
    const appliesTo = (targetId: string): boolean => {
      if (!field.speakerPositions || field.speakerPositions.length === 0) return true;
      const position = expectedIds?.speakerPositionByStudent?.[targetId];
      if (position === undefined) return true;
      return field.speakerPositions.includes(position);
    };

    const expected =
      field.scope === "speaker"
        ? (expectedIds?.studentIds ?? []).filter(appliesTo)
        : (expectedIds?.teamIds ?? []);

    for (const [targetId, values] of Object.entries(bucket)) {
      // 不适用于这个位次的字段：既不校验取值，也不报"漏填"
      if (!appliesTo(targetId)) continue;

      const value = values[field.key];
      if (field.required && isBlank(value)) {
        issues.push({
          fieldKey: field.key,
          message: `"${field.label}" 在 ${targetId} 上没有填写。`,
        });
        continue;
      }
      if (!isBlank(value)) {
        for (const issue of checkValueType(field, value)) {
          issues.push({ ...issue, message: `${issue.message}（${targetId}）` });
        }
      }
    }

    /*
     * 漏打：本场应该被打分、但数据里完全没有出现的人。
     * 只校验"已填的项"是不够的 —— 那样一个裁判可以一个人都不打就提交。
     */
    if (field.required) {
      for (const targetId of expected) {
        if (!(targetId in bucket)) {
          issues.push({
            fieldKey: field.key,
            message: `"${field.label}" 缺少被打分对象 ${targetId} 的取值。`,
          });
        }
      }
    }
  }

  return { valid: issues.length === 0, issues };
}

/** 一条列表条目是否"写了内容"（空条目不算数）。 */
function isBlankListEntry(entry: BallotListEntry): boolean {
  if (typeof entry === "string") return entry.trim() === "";
  // 结构化条目：只要**任何一个**子字段有内容就算写了
  return Object.values(entry).every((text) => (text ?? "").trim() === "");
}

/** 单项取值是否与字段类型/区间相符。 */
function checkValueType(field: BallotField, value: BallotValue): BallotValidationIssue[] {
  const issues: BallotValidationIssue[] = [];

  if (field.type === "score") {
    if (typeof value !== "number" || Number.isNaN(value)) {
      issues.push({ fieldKey: field.key, message: `"${field.label}" 必须是数字。` });
      return issues;
    }
    if (typeof field.min === "number" && value < field.min) {
      issues.push({
        fieldKey: field.key,
        message: `"${field.label}" 是 ${value}，低于最小值 ${field.min}。`,
      });
    }
    if (typeof field.max === "number" && value > field.max) {
      issues.push({
        fieldKey: field.key,
        message: `"${field.label}" 是 ${value}，高于最大值 ${field.max}。`,
      });
    }

    /*
     * 刻度校验：值必须是 `step` 的整数倍。
     *
     * JWSD：前三位发言者只能打整数（step 1），回复发言者允许半分（step 0.5）。
     * 用 epsilon 比较而不是 `%`，避免浮点误差把 35.5 判成不合法。
     */
    const step = field.step ?? 1;
    if (step > 0) {
      const ratio = (value - (field.min ?? 0)) / step;
      if (Math.abs(ratio - Math.round(ratio)) > 1e-6) {
        issues.push({
          fieldKey: field.key,
          message:
            step === 1
              ? `"${field.label}" 必须是整数（${value} 不是）。`
              : `"${field.label}" 必须是 ${step} 的整数倍（${value} 不是）。`,
        });
      }
    }
    return issues;
  }

  if (field.type === "boolean") {
    if (typeof value !== "boolean") {
      issues.push({ fieldKey: field.key, message: `"${field.label}" 必须是「是/否」。` });
    }
    return issues;
  }

  if (field.type === "list") {
    if (!Array.isArray(value)) {
      issues.push({ fieldKey: field.key, message: `"${field.label}" 必须是一组条目。` });
      return issues;
    }
    // 空条目不算数 —— 裁判点了几次"+ 添加"但没写字，不该算作一条论点
    const filled = value.filter((entry) => !isBlankListEntry(entry));

    if (typeof field.minItems === "number" && filled.length < field.minItems) {
      issues.push({
        fieldKey: field.key,
        message: `"${field.label}" 至少需要 ${field.minItems} 条，目前只有 ${filled.length} 条。`,
      });
    }
    if (typeof field.maxItems === "number" && filled.length > field.maxItems) {
      issues.push({
        fieldKey: field.key,
        message: `"${field.label}" 最多 ${field.maxItems} 条，目前有 ${filled.length} 条。`,
      });
    }

    // 结构化条目：检查必填子字段（JWSD 的裁判笔记是可选的，因此不会命中）
    if (field.itemFields && field.itemFields.length > 0) {
      for (const [index, entry] of filled.entries()) {
        if (typeof entry === "string") continue;
        for (const sub of field.itemFields) {
          if (!sub.required) continue;
          if ((entry[sub.key] ?? "").trim() === "") {
            issues.push({
              fieldKey: field.key,
              message: `"${field.label}" 第 ${index + 1} 条的「${sub.label}」没有填写。`,
            });
          }
        }
      }
    }
    return issues;
  }

  if (typeof value !== "string") {
    issues.push({ fieldKey: field.key, message: `"${field.label}" 必须是文字。` });
    return issues;
  }

  if (field.type === "text") {
    const length = value.trim().length;
    /*
     * ⚠️ 这里**刻意不检查 minLength**。
     * 那是"建议字数"，按规范只能提示、不能阻止提交 —— 见字段定义处的说明。
     */
    if (typeof field.maxLength === "number" && length > field.maxLength) {
      issues.push({
        fieldKey: field.key,
        message: `"${field.label}" 目前 ${length} 字，最多 ${field.maxLength} 字。`,
      });
    }
  }
  return issues;
}

/**
 * 计算总项（裁判不填）。
 *
 * 即兴辩论的总分 = 论证 + 交锋 + 分析与应变 + 表达 + 结构与策略，满分 30。
 * 规范明确"总分自动计算，裁判不应手动输入"。
 *
 * 返回 `按对象 id → 总项键 → 分数`。队伍级总项放 `teamTotals`，
 * 学生级放 `speakerTotals`。
 */
export function computeBallotTotals(
  schema: BallotTemplateSchema,
  data: BallotData,
  context: {
    /**
     * 队伍 id → 该队的发言者（学生）id。
     *
     * 只有 `teamFromSpeakers` 型的总项需要它：队伍总分要把**队员各自的
     * 某个总项**加起来，而 `BallotData` 只按学生、按队伍各存一份，
     * 并不知道谁属于哪一队。
     */
    teamMembersByTeam?: Record<string, string[]>;
  } = {},
): {
  teamTotals: Record<string, Record<string, number>>;
  speakerTotals: Record<string, Record<string, number>>;
} {
  const teamTotals: Record<string, Record<string, number>> = {};
  const speakerTotals: Record<string, Record<string, number>> = {};

  const sumFields = (values: Record<string, BallotValue>, fieldKeys: string[]): number =>
    fieldKeys.reduce((running, fieldKey) => {
      const raw = values[fieldKey];
      const numeric = typeof raw === "number" ? raw : Number(raw);
      return Number.isFinite(numeric) ? running + numeric : running;
    }, 0);

  /*
   * 先算"按队伍"与"按发言者"的总项，再算"由发言者汇总"的。
   *
   * ⚠️ 顺序很重要：队伍总分要把发言者的总项加起来，因此必须等发言者总项算完。
   * 这里刻意用**两趟循环**把这个依赖关系写清楚，
   * 而不是依赖 totals 数组里恰好先写了发言者总项。
   */
  for (const total of schema.totals ?? []) {
    if (total.scope === "teamFromSpeakers") continue;
    const bucket = total.scope === "team" ? data.teamValues : data.speakerValues;
    const target = total.scope === "team" ? teamTotals : speakerTotals;

    for (const [objectId, values] of Object.entries(bucket)) {
      target[objectId] = {
        ...(target[objectId] ?? {}),
        [total.key]: sumFields(values, total.sumOf),
      };
    }
  }

  for (const total of schema.totals ?? []) {
    if (total.scope !== "teamFromSpeakers") continue;
    const fromKeys = total.fromSpeakerTotals ?? [];
    if (fromKeys.length === 0) continue;

    for (const teamId of Object.keys(context.teamMembersByTeam ?? {})) {
      const members = context.teamMembersByTeam?.[teamId] ?? [];
      const sum = members.reduce((running, studentId) => {
        // 一位发言者可能只填了其中一类（普通发言者没有回复项的分数），因此逐项累加
        const memberSum = fromKeys.reduce(
          (partial, key) => partial + (speakerTotals[studentId]?.[key] ?? 0),
          0,
        );
        return running + memberSum;
      }, 0);
      teamTotals[teamId] = { ...(teamTotals[teamId] ?? {}), [total.key]: sum };
    }
  }

  return { teamTotals, speakerTotals };
}

/** 一条**软警告**：不阻止提交，但要请裁判确认。 */
export type BallotWarning = {
  code:
    | "winner_score_mismatch"
    | "reason_too_brief"
    | "feedback_too_brief"
    | "score_unusually_high"
    | "score_unusually_low";
  message: string;
  fieldKey?: string;
};

/**
 * 软警告（规范第 13、20 节）。
 *
 * ⚠️ 规范对这两处的要求**都是"警告、不阻止提交"**，而不是拒绝：
 *   - 第 13 节："This should **NOT** automatically prevent submission. Instead, show:
 *     *Warning: Your selected winner has a substantially lower score...*"
 *   - 第 20 节："Do **not** block submission solely based on writing quality."
 *
 * 因此这些**不进** `issues`（那是拒绝提交用的），而是单独返回，
 * 由界面显示成"请确认"。
 */
export function findBallotWarnings(
  schema: BallotTemplateSchema,
  data: BallotData,
  context: {
    winnerTeamId: string | null;
    reasonForDecision: string | null;
    /** 判定"分数明显低于对方"的阈值；规范没有给具体数字 */
    mismatchThreshold?: number;
    /** 队伍 id → 队员 id。JWSD 的队伍总分要靠它才能算出来。 */
    teamMembersByTeam?: Record<string, string[]>;
  },
): BallotWarning[] {
  const warnings: BallotWarning[] = [];

  // ---- 1) 胜方的总分明显低于对方 ----
  // ⚠️ 必须把队伍名单传进去，否则 `teamFromSpeakers` 型的队伍总分算不出来，
  //    这条警告会永远不触发 —— 一个不会触发的检查等于没有检查。
  const { teamTotals } = computeBallotTotals(schema, data, {
    teamMembersByTeam: context.teamMembersByTeam,
  });
  const winnerTeamId = context.winnerTeamId;

  /*
   * ⚠️ 如果模板里已经有一条**硬规则**管这件事（PF 的 "不允许 Low Point Win"），
   * 就不要再报同样的软警告 —— 同一条信息既"阻止提交"又"可以确认继续"会让裁判困惑。
   */
  const hasHardWinnerRule = (schema.rules ?? []).some(
    (rule) => rule.kind === "winnerMustHaveHighestTotal",
  );

  if (!hasHardWinnerRule && winnerTeamId && Object.keys(teamTotals).length >= 2) {
    const winnerTotal = sumAll(teamTotals[winnerTeamId]);
    const loserTotals = Object.entries(teamTotals)
      .filter(([teamId]) => teamId !== winnerTeamId)
      .map(([, totals]) => sumAll(totals))
      .filter((value): value is number => value !== null);

    if (winnerTotal !== null && loserTotals.length > 0) {
      /*
       * 规范举的例子是 19 对 26（差 7 分）应当警告，而 24 对 23（差 1 分）正常。
       * 规范**没有给出阈值**，这里取 5 分并写明是我的选择。
       */
      const threshold = context.mismatchThreshold ?? 5;
      const bestLoser = Math.max(...loserTotals);
      if (bestLoser - winnerTotal >= threshold) {
        warnings.push({
          code: "winner_score_mismatch",
          message:
            `你选的胜方总分是 ${winnerTotal}，而对方是 ${bestLoser}，相差 ${bestLoser - winnerTotal} 分。` +
            "分数不应机械决定胜负，所以这**不会阻止提交** —— 但请确认这是你的本意。",
        });
      }
    }
  }

  // ---- 2) 判决理由过短 ----
  const reasonField = schema.fields.find((field) => field.key === "reason_for_decision");
  const reasonText = (context.reasonForDecision ?? "").trim();
  if (reasonText.length > 0) {
    const minLength = reasonField?.minLength ?? 100;
    if (reasonText.length < minLength) {
      warnings.push({
        code: "reason_too_brief",
        fieldKey: "reason_for_decision",
        message:
          `你的判决理由只有 ${reasonText.length} 字（建议至少 ${minLength} 字）。` +
          "请说明哪个交锋决定了这场比赛 —— 这**不会阻止提交**，但学生可能看不懂结果。",
      });
    }
  }

  /*
   * ---- 3) 其他文字字段少于建议字数 ----
   *
   * 覆盖**所有**带 `minLength` 的文字字段（不只是反馈），
   * 这样将来加新的建议字数不用改这里。判决理由已经单独处理过，跳过以免重复。
   */
  for (const field of schema.fields) {
    if (field.type !== "text") continue;
    if (typeof field.minLength !== "number") continue;
    if (field.key === "reason_for_decision") continue;
    if (field.scope === "match") {
      const raw = data.matchValues[field.key];
      if (typeof raw !== "string") continue;
      const text = raw.trim();
      if (text.length > 0 && text.length < field.minLength) {
        warnings.push({
          code: "feedback_too_brief",
          fieldKey: field.key,
          message: `「${field.label}」只有 ${text.length} 字（建议至少 ${field.minLength} 字）。`,
        });
      }
      continue;
    }
    const bucket = field.scope === "team" ? data.teamValues : data.speakerValues;
    for (const [targetId, values] of Object.entries(bucket)) {
      const raw = values[field.key];
      if (typeof raw !== "string") continue;
      const text = raw.trim();
      if (text.length > 0 && text.length < field.minLength) {
        warnings.push({
          code: "feedback_too_brief",
          fieldKey: field.key,
          message: `「${field.label}」在 ${targetId} 上只有 ${text.length} 字（建议至少 ${field.minLength} 字）。`,
        });
      }
    }
  }

  /*
   * ---- 4) 分数异常高 / 异常低 ----
   *
   * PF 规范第 49 节：超过 29 分或低于 22 分都只是**提示**，
   * 裁判确认后**可以继续提交**。因此这里产生的是 warning，不是 issue。
   */
  const { speakerTotals } = computeBallotTotals(schema, data, {
    teamMembersByTeam: context.teamMembersByTeam,
  });

  for (const total of schema.totals ?? []) {
    if (total.confirmAbove === undefined && total.confirmBelow === undefined) continue;
    if (total.scope !== "speaker") continue; // 目前只有个人总分需要这种确认

    for (const [studentId, totals] of Object.entries(speakerTotals)) {
      const value = totals[total.key];
      if (typeof value !== "number") continue;

      if (total.confirmAbove !== undefined && value > total.confirmAbove) {
        warnings.push({
          code: "score_unusually_high",
          fieldKey: total.key,
          message:
            `${studentId} 的${total.label}是 ${value}，高于 ${total.confirmAbove}。` +
            "这**不会阻止提交**，但请确认这确实是异常出色的表现。",
        });
      }
      if (total.confirmBelow !== undefined && value > 0 && value < total.confirmBelow) {
        warnings.push({
          code: "score_unusually_low",
          fieldKey: total.key,
          message:
            `${studentId} 的${total.label}是 ${value}，低于 ${total.confirmBelow}。` +
            "这**不会阻止提交**，但请确认这确实反映了当场表现。",
        });
      }
    }
  }

  return warnings;
}

/** 把一组总项相加；没有有效数字时返回 null。 */
function sumAll(totals: Record<string, number>): number | null {
  const values = Object.values(totals);
  if (values.length === 0) return null;
  return values.reduce((sum, value) => sum + value, 0);
}

/**
 * 判断一份评分表能否提交。
 *
 * 规范把状态机放在数据库枚举里（`draft/submitted/reopened/resubmitted/published`），
 * 这里只判断**内容**是否满足模板要求，不判断状态转换。
 */
export function canSubmitBallot(
  schema: BallotTemplateSchema,
  data: BallotData,
  context: {
    winnerTeamId: string | null;
    reasonForDecision: string | null;
    expectedIds?: {
      studentIds?: readonly string[];
      teamIds?: readonly string[];
      speakerPositionByStudent?: Record<string, number>;
    };
    /** 队伍 id → 队员 id。跨字段规则要算队伍总项时必需。 */
    teamMembersByTeam?: Record<string, string[]>;
  },
): BallotValidationResult {
  const issues = [...validateBallotData(schema, data, context.expectedIds).issues];

  if (schema.winnerRequired && (context.winnerTeamId ?? "") === "") {
    issues.push({ message: "必须选出胜方。" });
  }
  if (schema.reasonForDecisionRequired && (context.reasonForDecision ?? "").trim() === "") {
    issues.push({ fieldKey: "reason_for_decision", message: "必须填写判决理由。" });
  }

  /*
   * ---- 跨字段硬规则 ----
   *
   * ⚠️ 这些规则**只看胜负关系，不看分数高低是否"合理"** ——
   * 例如"胜方分数必须更高"是 PF 的硬性规则（不允许 Low Point Win），
   * 而 1v1 与 JWSD 里同类情况只是软警告。差别写在模板里，不写在代码里。
   */
  /*
   * ---- 总项的硬性区间 ----
   *
   * WSDC 规范要求"reject 59 / 81"，因此这里产生的是 issues（拒绝），
   * 而不是 warning。注意它与 `confirmBelow`/`confirmAbove` 的区别：
   * 那两个只是"请确认"。
   */
  for (const total of schema.totals ?? []) {
    if (total.hardMin === undefined && total.hardMax === undefined) continue;

    const { speakerTotals, teamTotals } = computeBallotTotals(schema, data, {
      teamMembersByTeam: context.teamMembersByTeam,
    });
    const bucket = total.scope === "speaker" ? speakerTotals : teamTotals;

    for (const [targetId, totals] of Object.entries(bucket)) {
      const value = totals[total.key];
      if (typeof value !== "number") continue;
      if (total.hardMin !== undefined && value < total.hardMin) {
        issues.push({
          message: `${targetId} 的${total.label}是 ${value}，低于本赛制允许的最低分 ${total.hardMin}。`,
        });
      }
      if (total.hardMax !== undefined && value > total.hardMax) {
        issues.push({
          message: `${targetId} 的${total.label}是 ${value}，高于本赛制允许的最高分 ${total.hardMax}。`,
        });
      }
    }
  }

  const rules = schema.rules ?? [];
  if (rules.length > 0) {
    const hasWinner = (context.winnerTeamId ?? "") !== "";
    const { teamTotals } = computeBallotTotals(schema, data, {
      teamMembersByTeam: context.teamMembersByTeam,
    });

    for (const rule of rules) {
      const entries = Object.entries(teamTotals)
        .map(([teamId, totals]) => ({ teamId, value: totals[rule.totalKey] }))
        .filter(
          (entry): entry is { teamId: string; value: number } => typeof entry.value === "number",
        );

      if (entries.length < 2) continue; // 还没算得出两支队伍的总项，无法判断

      if (rule.kind === "teamTotalGapWithinRange") {
        const values = entries.map((entry) => entry.value);
        const gap = Math.max(...values) - Math.min(...values);
        if (gap < rule.minGap) {
          issues.push({ message: rule.message });
        } else if (gap > rule.maxGap) {
          issues.push({ message: rule.message });
        }
        continue;
      }

      if (rule.kind === "totalsMustNotTie") {
        const values = entries.map((entry) => entry.value);
        if (new Set(values).size < values.length) {
          issues.push({ message: rule.message });
        }
        continue;
      }

      // winnerMustHaveHighestTotal
      if (!hasWinner) continue; // 上面的"必须选出胜方"已经报过了
      const winner = entries.find((entry) => entry.teamId === context.winnerTeamId);
      if (!winner) continue;

      const bestLoser = Math.max(
        ...entries
          .filter((entry) => entry.teamId !== context.winnerTeamId)
          .map((entry) => entry.value),
      );
      if (winner.value < bestLoser) {
        issues.push({ message: rule.message });
      }
    }
  }

  return { valid: issues.length === 0, issues };
}
