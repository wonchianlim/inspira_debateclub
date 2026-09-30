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
   * 仅 `list` 有意义：**每条可带哪些子字段**。
   *
   * JWSD 规范里每条论点可带一个"裁判笔记"，每条交锋可带
   * "正方主张 / 反方主张 / 裁判评估"三段笔记。
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
  /** 仅 `teamFromSpeakers`：把发言者的哪个总项相加 */
  fromSpeakerTotal?: string;
  /** 满分，用于显示 `/30` 或 `/100` */
  max: number;
  /** 是否是"每位发言者都要有的"总项（用于界面按人显示） */
  perSpeaker?: boolean;
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
      if (!total.fromSpeakerTotal) {
        issues.push({ message: `总项 "${total.label}" 没有说明由发言者的哪个总项相加。` });
        continue;
      }
      const speakerTotal = (schema.totals ?? []).find(
        (candidate) => candidate.key === total.fromSpeakerTotal && candidate.scope === "speaker",
      );
      if (!speakerTotal) {
        issues.push({
          message: `总项 "${total.label}" 引用的发言者总项 "${total.fromSpeakerTotal}" 不存在或不是发言者级的。`,
        });
        continue;
      }
      /*
       * 队伍总分满分应当是"人数 × 每人满分"，但**人数是可变的**
       * （3 人、4 人，或将来加替补），因此只要求它是每人满分的整数倍 ——
       * 写死 300 会在换人数时变成错的。
       */
      if (speakerTotal.max > 0 && total.max % speakerTotal.max !== 0) {
        issues.push({
          message: `总项 "${total.label}" 的满分 ${total.max} 不是每人满分 ${speakerTotal.max} 的整数倍。`,
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
  expectedIds?: { studentIds?: readonly string[]; teamIds?: readonly string[] },
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
    const expected =
      field.scope === "speaker" ? (expectedIds?.studentIds ?? []) : (expectedIds?.teamIds ?? []);

    for (const [targetId, values] of Object.entries(bucket)) {
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
    const fromKey = total.fromSpeakerTotal;
    if (!fromKey) continue;

    for (const teamId of Object.keys(context.teamMembersByTeam ?? {})) {
      const members = context.teamMembersByTeam?.[teamId] ?? [];
      const sum = members.reduce(
        (running, studentId) => running + (speakerTotals[studentId]?.[fromKey] ?? 0),
        0,
      );
      teamTotals[teamId] = { ...(teamTotals[teamId] ?? {}), [total.key]: sum };
    }
  }

  return { teamTotals, speakerTotals };
}

/** 一条**软警告**：不阻止提交，但要请裁判确认。 */
export type BallotWarning = {
  code: "winner_score_mismatch" | "reason_too_brief" | "feedback_too_brief";
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

  if (winnerTeamId && Object.keys(teamTotals).length >= 2) {
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
    expectedIds?: { studentIds?: readonly string[]; teamIds?: readonly string[] };
  },
): BallotValidationResult {
  const issues = [...validateBallotData(schema, data, context.expectedIds).issues];

  if (schema.winnerRequired && (context.winnerTeamId ?? "") === "") {
    issues.push({ message: "必须选出胜方。" });
  }
  if (schema.reasonForDecisionRequired && (context.reasonForDecision ?? "").trim() === "") {
    issues.push({ fieldKey: "reason_for_decision", message: "必须填写判决理由。" });
  }

  return { valid: issues.length === 0, issues };
}
