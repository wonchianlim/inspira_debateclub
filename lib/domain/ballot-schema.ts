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
export const BALLOT_FIELD_TYPES = ["score", "text", "boolean"] as const;
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
  /** 给裁判的说明 */
  help?: string;
};

export type BallotTemplateSchema = {
  /** **schema 格式本身**的版本，与 `ballot_templates.version`（模板版本）不是一回事 */
  schemaVersion: 1;
  fields: BallotField[];
  /** 是否必须选出胜方 */
  winnerRequired: boolean;
  /** 是否必须填写判决理由 */
  reasonForDecisionRequired: boolean;
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

  return { valid: issues.length === 0, issues };
}

/** 一位被评者的取值。 */
export type BallotValue = number | string | boolean | null | undefined;

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

  if (typeof value !== "string") {
    issues.push({ fieldKey: field.key, message: `"${field.label}" 必须是文字。` });
  }
  return issues;
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
