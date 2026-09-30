"use client";

import { useActionState, useState } from "react";

import { FormMessage } from "@/components/domain/form-message";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { BallotField } from "@/lib/domain/ballot-schema";
import type { BallotContext } from "@/lib/judge/ballots";
import { saveBallotDraftAction, submitBallotAction } from "@/lib/judge/ballot-actions";
import { INITIAL_FORM_STATE } from "@/lib/forms/form-state";
import { BALLOT_DRAFT_NOTE } from "@/lib/validation/ballot-submission";

/**
 * 裁判填表。
 *
 * 表单**完全按模板生成** —— 模板里有哪些字段，这里就渲染哪些输入框。
 * 因此代码里没有任何"WSDC 该打哪几项"的知识：那是配置。
 *
 * 逐项分的键用 `学生id|字段键` 拼成字符串，在服务端再拆开 ——
 * 这样可以用一个扁平的 FormData 表达"二维"的评分表。
 */
/** 列表条目的取值形态：纯文字，或带子字段。 */
type ListEntry = string | Record<string, string>;

/** 从 context 里读出一个"按队伍"的列表字段。 */
function readTeamList(context: BallotContext, teamId: string, fieldKey: string): ListEntry[] {
  const raw = context.data.teamValues[teamId]?.[fieldKey];
  return Array.isArray(raw) ? (raw as ListEntry[]) : [];
}

/** 从 context 里读出一个"整场"的列表字段。 */
function readMatchList(context: BallotContext, fieldKey: string): ListEntry[] {
  const raw = context.data.matchValues[fieldKey];
  return Array.isArray(raw) ? (raw as ListEntry[]) : [];
}

/**
 * **可重复列表字段**（论点、交锋）。
 *
 * 规范里这些字段都有"最少 1 条、最多 5 条、点 + 添加"的形状，
 * 而且 JWSD / WSDC / PF 的每条还能带子字段（裁判笔记、三段交锋笔记）。
 *
 * 子字段**全是可选**时就按可选渲染 —— 规范里它们是 optional，
 * 强迫裁判给每条都写笔记会让填表变慢，而那正是规范想避免的。
 */
function ListField({
  field,
  entries,
  disabled,
  onChange,
}: {
  field: BallotField;
  entries: ListEntry[];
  disabled: boolean;
  onChange: (entries: ListEntry[]) => void;
}) {
  const itemLabel = field.itemLabel ?? "条目";
  const maxItems = field.maxItems ?? 5;
  const hasSubFields = (field.itemFields ?? []).length > 0;

  // 至少显示一行，即使还没有内容 —— 否则裁判看不到该在哪里写
  const rows = entries.length > 0 ? entries : [hasSubFields ? {} : ""];

  const toObject = (entry: ListEntry): Record<string, string> =>
    typeof entry === "string" ? { text: entry } : entry;

  const setEntry = (index: number, next: ListEntry) => {
    const copy = [...rows];
    copy[index] = next;
    onChange(copy);
  };

  return (
    <div className="mb-2 flex flex-col gap-2">
      <Label className="text-xs">
        {field.label}
        <span className="text-muted-foreground ml-1 font-normal">
          （至少 {field.minItems ?? 1} 条，最多 {maxItems} 条）
        </span>
      </Label>

      {rows.map((entry, index) => (
        <div key={index} className="border-border flex flex-col gap-2 rounded-md border px-3 py-2">
          <div className="flex items-center gap-2">
            <span className="text-muted-foreground w-16 text-xs">
              {itemLabel} {index + 1}
            </span>
            <textarea
              rows={2}
              disabled={disabled}
              value={hasSubFields ? (toObject(entry).text ?? "") : (entry as string)}
              onChange={(event) =>
                setEntry(
                  index,
                  hasSubFields
                    ? { ...toObject(entry), text: event.target.value }
                    : event.target.value,
                )
              }
              className="border-input bg-background flex-1 rounded-md border px-3 py-2 text-sm"
            />
            {rows.length > 1 ? (
              <Button
                type="button"
                size="sm"
                variant="ghost"
                disabled={disabled}
                onClick={() => onChange(rows.filter((_, i) => i !== index))}
              >
                删除
              </Button>
            ) : null}
          </div>

          {hasSubFields
            ? (field.itemFields ?? []).map((sub) => (
                <div key={sub.key} className="flex items-center gap-2 pl-16">
                  <span className="text-muted-foreground w-24 text-xs">{sub.label}</span>
                  <Input
                    disabled={disabled}
                    value={toObject(entry)[sub.key] ?? ""}
                    onChange={(event) =>
                      setEntry(index, { ...toObject(entry), [sub.key]: event.target.value })
                    }
                    className="flex-1"
                  />
                </div>
              ))
            : null}
        </div>
      ))}

      {rows.length < maxItems ? (
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={disabled}
          className="self-start"
          onClick={() => onChange([...rows, hasSubFields ? {} : ""])}
        >
          + 添加{itemLabel}
        </Button>
      ) : null}
    </div>
  );
}

/**
 * **排名字段**（BP 的四队名次）。
 *
 * 与其它字段不同，它的值**分布在多支队伍上**，而且彼此互斥 ——
 * 因此不能用"每支队伍一个下拉"来处理：那样裁判可以给两队都选"第 1 名"，
 * 到提交时才发现。这里改成**每个名次一个下拉**，选过的队伍就从其它下拉里消失，
 * 让重复在界面上就**不可能发生**。
 */
function RankingField({
  field,
  teams,
  value,
  disabled,
  onChange,
}: {
  field: BallotField;
  teams: { teamId: string; label: string }[];
  value: Record<string, number>;
  disabled: boolean;
  onChange: (value: Record<string, number>) => void;
}) {
  const labels = field.rankLabels ?? [];
  // 名次 → 队伍
  const byRank = new Map<number, string>();
  for (const [teamId, rank] of Object.entries(value)) {
    if (Number.isFinite(rank)) byRank.set(rank, teamId);
  }

  return (
    <div className="mb-2 flex flex-col gap-2">
      <Label className="text-xs">
        {field.label}
        <span className="text-muted-foreground ml-1 font-normal">
          （每支队伍一个名次，不能重复）
        </span>
      </Label>
      {labels.map((label, index) => {
        const rank = index + 1;
        const selected = byRank.get(rank) ?? "";
        // 已被**别的名次**选走的队伍，不在这个下拉里出现
        const takenElsewhere = new Set(
          [...byRank.entries()]
            .filter(([otherRank]) => otherRank !== rank)
            .map(([, teamId]) => teamId),
        );

        return (
          <div key={rank} className="flex items-center gap-2">
            <span className="w-20 text-sm">{label}</span>
            <select
              disabled={disabled}
              value={selected}
              onChange={(event) => {
                const next = { ...value };
                // 先清掉这个名次原来的队伍
                delete next[selected];
                if (event.target.value !== "") next[event.target.value] = rank;
                onChange(next);
              }}
              className="border-input bg-background h-9 w-72 rounded-md border px-2 text-sm"
            >
              <option value="">请选择</option>
              {teams
                .filter((team) => !takenElsewhere.has(team.teamId))
                .map((team) => (
                  <option key={team.teamId} value={team.teamId}>
                    {team.label}
                  </option>
                ))}
            </select>
          </div>
        );
      })}
    </div>
  );
}

export function BallotForm({ context }: { context: BallotContext }) {
  const [draftState, draftAction, savingDraft] = useActionState(
    saveBallotDraftAction,
    INITIAL_FORM_STATE,
  );
  const [submitState, submitAction, submitting] = useActionState(
    submitBallotAction,
    INITIAL_FORM_STATE,
  );
  const busy = savingDraft || submitting;

  /*
   * 只对某些发言位次生效的字段（JWSD 的回复发言者用另一组）。
   * `speakerPositions` 未填的字段对所有人都生效。
   */
  const fieldsForSpeaker = (position: number) =>
    context.schema.fields.filter(
      (field) =>
        field.scope === "speaker" &&
        (!field.speakerPositions || field.speakerPositions.includes(position)),
    );

  /** 非学生范围的字段（按队伍 / 整场），列表与标量都在这里处理。 */
  const teamFields = context.schema.fields.filter((field) => field.scope === "team");
  const matchFields = context.schema.fields.filter((field) => field.scope === "match");

  const readOnly =
    context.ballotStatus !== null &&
    context.ballotStatus !== "draft" &&
    context.ballotStatus !== "reopened";

  /*
   * 表单提交时，用一个隐藏字段把结构化数据交给服务端。
   *
   * 为什么这样做而不是直接在服务端读 formData 的各个输入：
   * 字段是**动态的**（来自模板），服务端无法预先知道有哪些 name。
   * 让这个组件在提交前把它们收集成一个 JSON 是最直接的桥。
   */
  const [speakerScoresJson, setSpeakerScoresJson] = useState(
    JSON.stringify(context.data.speakerValues),
  );
  const [otherValuesJson, setOtherValuesJson] = useState(
    JSON.stringify({ ...context.data.matchValues, ...context.data.teamValues }),
  );

  const updateSpeaker = (studentId: string, fieldKey: string, value: string) => {
    const current = JSON.parse(speakerScoresJson) as Record<string, Record<string, unknown>>;
    current[studentId] = { ...(current[studentId] ?? {}), [fieldKey]: value === "" ? null : value };
    setSpeakerScoresJson(JSON.stringify(current));
  };

  const updateOther = (compositeKey: string, value: string) => {
    const current = JSON.parse(otherValuesJson) as Record<string, unknown>;
    current[compositeKey] = value === "" ? null : value;
    setOtherValuesJson(JSON.stringify(current));
  };

  return (
    <div className="flex flex-col gap-4">
      <p className="text-muted-foreground text-sm">{BALLOT_DRAFT_NOTE}</p>

      {readOnly ? (
        <p className="border-border rounded-md border px-3 py-2 text-sm">
          这份评分表已经提交，当前为「{context.ballotStatus}」，不能直接修改。
          如需更正，请联系管理员重开。
        </p>
      ) : null}

      {context.speakers.map((speaker) => {
        const fields = fieldsForSpeaker(speaker.speakerPosition);
        return (
          <fieldset key={speaker.studentId} className="border-border rounded-md border px-3 py-3">
            <legend className="px-1 text-sm font-medium">
              {speaker.displayName}
              {speaker.speakerPosition > 0 ? (
                <span className="text-muted-foreground ml-2 text-xs">
                  第 {speaker.speakerPosition} 位发言
                </span>
              ) : null}
            </legend>
            <div className="flex flex-wrap items-end gap-3">
              {fields.map((field) => (
                <div key={field.key} className="flex flex-col gap-1">
                  <Label htmlFor={`${speaker.studentId}-${field.key}`} className="text-xs">
                    {field.label}
                    {field.type === "score" ? `（${field.min}–${field.max}）` : ""}
                  </Label>
                  {field.type === "score" && field.options ? (
                    // 有分档说明时用下拉，让裁判看到每一档的含义（例如裁判信心的 3/2/1）
                    <select
                      id={`${speaker.studentId}-${field.key}`}
                      disabled={busy || readOnly}
                      defaultValue={
                        (context.data.speakerValues[speaker.studentId]?.[field.key] as string) ?? ""
                      }
                      onChange={(event) =>
                        updateSpeaker(speaker.studentId, field.key, event.target.value)
                      }
                      className="border-input bg-background h-9 w-56 rounded-md border px-2 text-sm"
                    >
                      <option value="">请选择</option>
                      {field.options.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.value} · {option.label}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <Input
                      id={`${speaker.studentId}-${field.key}`}
                      type={field.type === "score" ? "number" : "text"}
                      step={field.step ?? "any"}
                      min={field.min}
                      max={field.max}
                      disabled={busy || readOnly}
                      defaultValue={
                        (context.data.speakerValues[speaker.studentId]?.[field.key] as string) ?? ""
                      }
                      onChange={(event) =>
                        updateSpeaker(speaker.studentId, field.key, event.target.value)
                      }
                      className="w-32"
                    />
                  )}
                </div>
              ))}
            </div>
          </fieldset>
        );
      })}

      {/* ---- 按队伍的字段：标量与**可重复列表** ---- */}
      {teamFields.length > 0 ? (
        <fieldset className="border-border rounded-md border px-3 py-3">
          <legend className="px-1 text-sm font-medium">按队伍</legend>
          {context.teams.map((team) => (
            <div key={team.teamId} className="mb-4 flex flex-col gap-2">
              <span className="text-sm font-medium">{team.teamLabel ?? team.position}</span>
              {teamFields.map((field) =>
                field.type === "list" ? (
                  <ListField
                    key={field.key}
                    field={field}
                    entries={readTeamList(context, team.teamId, field.key)}
                    disabled={busy || readOnly}
                    onChange={(entries) =>
                      updateOther(`${team.teamId}|${field.key}`, JSON.stringify(entries))
                    }
                  />
                ) : (
                  <div key={field.key} className="flex flex-col gap-1">
                    <Label htmlFor={`${team.teamId}-${field.key}`} className="text-xs">
                      {field.label}
                    </Label>
                    <textarea
                      id={`${team.teamId}-${field.key}`}
                      rows={2}
                      disabled={busy || readOnly}
                      defaultValue={
                        (context.data.teamValues[team.teamId]?.[field.key] as string) ?? ""
                      }
                      onChange={(event) =>
                        updateOther(`${team.teamId}|${field.key}`, event.target.value)
                      }
                      className="border-input bg-background max-w-xl rounded-md border px-3 py-2 text-sm"
                    />
                  </div>
                ),
              )}
            </div>
          ))}
        </fieldset>
      ) : null}

      {/* ---- 整场的字段 ---- */}
      {matchFields.length > 0 ? (
        <fieldset className="border-border rounded-md border px-3 py-3">
          <legend className="px-1 text-sm font-medium">整场</legend>
          {matchFields.map((field) =>
            field.type === "ranking" ? (
              <RankingField
                key={field.key}
                field={field}
                teams={context.teams.map((team) => ({
                  teamId: team.teamId,
                  label: team.teamLabel ?? team.position,
                }))}
                value={
                  (context.data.matchValues[field.key] as Record<string, number> | undefined) ?? {}
                }
                disabled={busy || readOnly}
                onChange={(value) => updateOther(field.key, JSON.stringify(value))}
              />
            ) : field.type === "list" ? (
              <ListField
                key={field.key}
                field={field}
                entries={readMatchList(context, field.key)}
                disabled={busy || readOnly}
                onChange={(entries) => updateOther(field.key, JSON.stringify(entries))}
              />
            ) : field.key === "judge_confidence" && field.options ? (
              <div key={field.key} className="mb-2 flex flex-col gap-1">
                <Label htmlFor={`match-${field.key}`} className="text-xs">
                  {field.label}
                </Label>
                <select
                  id={`match-${field.key}`}
                  disabled={busy || readOnly}
                  defaultValue={(context.data.matchValues[field.key] as string) ?? ""}
                  onChange={(event) => updateOther(field.key, event.target.value)}
                  className="border-input bg-background h-9 max-w-72 rounded-md border px-2 text-sm"
                >
                  <option value="">请选择</option>
                  {field.options.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.value} · {option.label}
                    </option>
                  ))}
                </select>
              </div>
            ) : (
              <div key={field.key} className="mb-2 flex flex-col gap-1">
                <Label htmlFor={`match-${field.key}`} className="text-xs">
                  {field.label}
                  {field.minLength ? (
                    <span className="text-muted-foreground ml-1 font-normal">
                      （建议至少 {field.minLength} 字）
                    </span>
                  ) : null}
                </Label>
                <textarea
                  id={`match-${field.key}`}
                  rows={field.key === "reason_for_decision" ? 5 : 3}
                  disabled={busy || readOnly}
                  defaultValue={(context.data.matchValues[field.key] as string) ?? ""}
                  onChange={(event) => updateOther(field.key, event.target.value)}
                  className="border-input bg-background max-w-2xl rounded-md border px-3 py-2 text-sm"
                />
              </div>
            ),
          )}
        </fieldset>
      ) : null}

      {context.schema.winnerRequired || context.schema.reasonForDecisionRequired ? (
        <fieldset className="border-border rounded-md border px-3 py-3">
          <legend className="px-1 text-sm font-medium">判决</legend>
          {context.schema.winnerRequired ? (
            <div className="mb-2 flex flex-col gap-1">
              <Label htmlFor="winnerTeamId" className="text-xs">
                胜方
              </Label>
              <select
                id="winnerTeamId"
                defaultValue={context.winnerTeamId ?? ""}
                disabled={busy || readOnly}
                className="border-input bg-background h-9 max-w-72 rounded-md border px-2 text-sm"
              >
                <option value="">请选择</option>
                {context.teams.map((team) => (
                  <option key={team.teamId} value={team.teamId}>
                    {team.teamLabel ?? team.position}
                  </option>
                ))}
              </select>
            </div>
          ) : null}
          {context.schema.reasonForDecisionRequired ? (
            <div className="flex flex-col gap-1">
              <Label htmlFor="reasonForDecision" className="text-xs">
                判决理由
              </Label>
              <textarea
                id="reasonForDecision"
                name="reasonForDecision"
                rows={3}
                disabled={busy || readOnly}
                defaultValue={context.reasonForDecision ?? ""}
                className="border-input bg-background max-w-xl rounded-md border px-3 py-2 text-sm"
              />
            </div>
          ) : null}
        </fieldset>
      ) : null}

      <FormMessage status={draftState.status} message={draftState.message} />
      <FormMessage status={submitState.status} message={submitState.message} />

      {!readOnly ? (
        <div className="flex flex-wrap items-center gap-3">
          <form action={draftAction}>
            <input type="hidden" name="matchId" value={context.matchId} />
            <input type="hidden" name="speakerScoresJson" value={speakerScoresJson} />
            <input type="hidden" name="otherValuesJson" value={otherValuesJson} />
            <Button type="submit" variant="outline" disabled={busy}>
              {busy ? "…" : "保存草稿"}
            </Button>
          </form>

          {/*
            提交与保存草稿是**两个独立的表单**，但共用同一份数据。
            这样"保存草稿"永远不会因为内容不完整而失败 ——
            裁判是边听边记的，中途保存必须永远可用。
          */}
          <form action={submitAction}>
            <input type="hidden" name="matchId" value={context.matchId} />
            <input type="hidden" name="speakerScoresJson" value={speakerScoresJson} />
            <input type="hidden" name="otherValuesJson" value={otherValuesJson} />
            <Button type="submit" disabled={busy}>
              {busy ? "…" : "提交评分表"}
            </Button>
          </form>
        </div>
      ) : null}
    </div>
  );
}
