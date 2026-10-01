import type { BallotField, BallotTemplateSchema } from "@/lib/domain/ballot-schema";

/**
 * 提交前的自查（UI/UX 规范 §9.3 第 6 条「Review summary」与
 * "Validate arithmetic and required fields before review"）。
 *
 * ⚠️ 为什么要在这里再查一遍：服务端**已经**会校验（`canSubmitBallot`），
 * 但那只在点下"提交"之后才告诉裁判缺什么 —— 而填一份评分表要十几分钟，
 * 最后才发现"第 3 位学生的表达没打分"，只能从头找。
 *
 * ⚠️ 这里只查**必填**项，不重复服务端的全部规则：
 *   * 分数范围（min/max）、整数刻度这类交给服务端与模板校验，
 *     界面上的 `min`/`max` 属性已经挡住了大部分；
 *   * `minLength` 是**软阈值**（规范原文 "Recommended minimum"，
 *     并且明确 "Do not block submission solely based on writing quality"），
 *     因此这里只把字数报出来，不把它当成"还缺"。
 */

export type BallotReviewInput = {
  schema: BallotTemplateSchema;
  /** `学生id → 字段键 → 值` */
  speakerValues: Record<string, Record<string, unknown>>;
  /** `队伍id|字段键` 或 `字段键` → 值 */
  otherValues: Record<string, unknown>;
  speakers: { studentId: string; displayName: string; speakerPosition: number }[];
  teams: { teamId: string; teamLabel: string | null; position: string }[];
  winnerTeamId: string | null;
  reasonForDecision: string | null;
};

export type BallotReview = {
  /** 还缺的必填项（人话）。空数组表示"看起来都填齐了"。 */
  missing: string[];
  /** 胜方在界面上显示的名字；没选时为 null */
  winnerLabel: string | null;
  /** 判决理由已写的字数 */
  reasonLength: number;
};

function isFilled(value: unknown): boolean {
  if (value === null || value === undefined) return false;
  if (typeof value === "string") return value.trim() !== "";
  if (typeof value === "number") return Number.isFinite(value);
  if (Array.isArray(value)) return value.length > 0;
  return true;
}

/** 某个字段对该位发言者是否适用（JWSD 的回复发言者用另一组字段）。 */
function appliesToSpeaker(field: BallotField, speakerPosition: number): boolean {
  return !field.speakerPositions || field.speakerPositions.includes(speakerPosition);
}

function requiredLabel(field: BallotField): string {
  return field.label;
}

/** 列表字段的"够不够"看条数，不看是否非空。 */
function listIsFilled(value: unknown, field: BallotField): boolean {
  const entries = Array.isArray(value) ? value : [];
  const minimum = field.minItems ?? 1;
  return entries.filter((entry) => isFilled(entry)).length >= minimum;
}

export function reviewBallot(input: BallotReviewInput): BallotReview {
  const missing: string[] = [];

  // ---- 判决 ----
  if (input.schema.winnerRequired && !input.winnerTeamId) {
    missing.push("胜方");
  }
  const reason = (input.reasonForDecision ?? "").trim();
  if (input.schema.reasonForDecisionRequired && reason === "") {
    missing.push("判决理由");
  }

  const winnerTeam = input.teams.find((team) => team.teamId === input.winnerTeamId);

  // ---- 学生范围 ----
  for (const speaker of input.speakers) {
    for (const field of input.schema.fields) {
      if (field.scope !== "speaker" || !field.required) continue;
      if (!appliesToSpeaker(field, speaker.speakerPosition)) continue;
      const value = input.speakerValues[speaker.studentId]?.[field.key];
      const ok = field.type === "list" ? listIsFilled(value, field) : isFilled(value);
      if (!ok) missing.push(`${speaker.displayName} · ${requiredLabel(field)}`);
    }
  }

  // ---- 队伍范围 ----
  for (const team of input.teams) {
    for (const field of input.schema.fields) {
      if (field.scope !== "team" || !field.required) continue;
      const value = input.otherValues[`${team.teamId}|${field.key}`];
      const ok = field.type === "list" ? listIsFilled(value, field) : isFilled(value);
      if (!ok) {
        missing.push(`${team.teamLabel ?? team.position} · ${requiredLabel(field)}`);
      }
    }
  }

  // ---- 整场范围 ----
  for (const field of input.schema.fields) {
    if (field.scope !== "match" || !field.required) continue;
    const value = input.otherValues[field.key];
    const ok = field.type === "list" ? listIsFilled(value, field) : isFilled(value);
    if (!ok) missing.push(requiredLabel(field));
  }

  return {
    missing,
    winnerLabel: winnerTeam ? (winnerTeam.teamLabel ?? winnerTeam.position) : null,
    reasonLength: reason.length,
  };
}
