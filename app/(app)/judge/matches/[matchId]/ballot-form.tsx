"use client";

import { useActionState, useState } from "react";

import { FormMessage } from "@/components/domain/form-message";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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

  const speakerFields = context.schema.fields.filter((field) => field.scope === "speaker");
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

      {context.speakers.map((speaker) => (
        <fieldset key={speaker.studentId} className="border-border rounded-md border px-3 py-3">
          <legend className="px-1 text-sm font-medium">{speaker.displayName}</legend>
          <div className="flex flex-wrap items-end gap-3">
            {speakerFields.map((field) => (
              <div key={field.key} className="flex flex-col gap-1">
                <Label htmlFor={`${speaker.studentId}-${field.key}`} className="text-xs">
                  {field.label}
                  {field.type === "score" ? `（${field.min}–${field.max}）` : ""}
                </Label>
                <Input
                  id={`${speaker.studentId}-${field.key}`}
                  type={field.type === "score" ? "number" : "text"}
                  step={field.step ?? "any"}
                  disabled={busy || readOnly}
                  defaultValue={
                    (context.data.speakerValues[speaker.studentId]?.[field.key] as string) ?? ""
                  }
                  onChange={(event) =>
                    updateSpeaker(speaker.studentId, field.key, event.target.value)
                  }
                  className="w-32"
                />
              </div>
            ))}
          </div>
        </fieldset>
      ))}

      {teamFields.length > 0 ? (
        <fieldset className="border-border rounded-md border px-3 py-3">
          <legend className="px-1 text-sm font-medium">按队伍</legend>
          {context.teams.map((team) => (
            <div key={team.teamId} className="mb-2 flex flex-wrap items-end gap-3">
              <span className="w-32 text-sm">{team.teamLabel ?? team.position}</span>
              {teamFields.map((field) => (
                <div key={field.key} className="flex flex-col gap-1">
                  <Label htmlFor={`${team.teamId}-${field.key}`} className="text-xs">
                    {field.label}
                  </Label>
                  <Input
                    id={`${team.teamId}-${field.key}`}
                    type={field.type === "score" ? "number" : "text"}
                    disabled={busy || readOnly}
                    defaultValue={
                      (context.data.teamValues[team.teamId]?.[field.key] as string) ?? ""
                    }
                    onChange={(event) =>
                      updateOther(`${team.teamId}|${field.key}`, event.target.value)
                    }
                    className="w-32"
                  />
                </div>
              ))}
            </div>
          ))}
        </fieldset>
      ) : null}

      {matchFields.length > 0 ? (
        <fieldset className="border-border rounded-md border px-3 py-3">
          <legend className="px-1 text-sm font-medium">整场</legend>
          {matchFields.map((field) => (
            <div key={field.key} className="mb-2 flex flex-col gap-1">
              <Label htmlFor={`match-${field.key}`} className="text-xs">
                {field.label}
              </Label>
              {field.type === "text" ? (
                <textarea
                  id={`match-${field.key}`}
                  rows={3}
                  disabled={busy || readOnly}
                  defaultValue={(context.data.matchValues[field.key] as string) ?? ""}
                  onChange={(event) => updateOther(field.key, event.target.value)}
                  className="border-input bg-background max-w-xl rounded-md border px-3 py-2 text-sm"
                />
              ) : (
                <Input
                  id={`match-${field.key}`}
                  type={field.type === "score" ? "number" : "text"}
                  disabled={busy || readOnly}
                  defaultValue={(context.data.matchValues[field.key] as string) ?? ""}
                  onChange={(event) => updateOther(field.key, event.target.value)}
                  className="w-32"
                />
              )}
            </div>
          ))}
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
