"use client";

import { useActionState, useRef, useState } from "react";

import { FormMessage } from "@/components/domain/form-message";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { BallotField } from "@/lib/domain/ballot-schema";
import { reviewBallot } from "@/lib/domain/ballot-review";
import type { BallotContext } from "@/lib/judge/ballots";
import { saveBallotDraftAction, submitBallotAction } from "@/lib/judge/ballot-actions";
import { INITIAL_FORM_STATE } from "@/lib/forms/form-state";
import { BALLOT_DRAFT_NOTE } from "@/lib/validation/ballot-submission";
import { CLUB_DEFAULT_TIMEZONE, utcToZonedLocal } from "@/lib/domain/timezone";

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
            {/* 左侧的 span 不是 label，span 不提供可访问名称，因此这里必须显式给 */}
            <textarea
              aria-label={`${field.label}第 ${index + 1} 条`}
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
            {/* 同上：左侧的 span 不是 label */}
            <select
              aria-label={`${label}的队伍`}
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

  /*
   * ⚠️ 胜方与判决理由必须是**受控**的。
   *
   * 原来胜方用的是一个**没有 name 的 `<select>`**，判决理由虽然写了 name，
   * 却和所有字段一样被放在**两个 <form> 之外** ——
   * 于是 `formData.get("winnerTeamId")` / `get("reasonForDecision")` 永远是 null。
   * 服务端的 `canSubmitBallot` 要求必填，结果是：**PF 这类赛制根本提交不了**，
   * 裁判选完胜方、写完理由，点提交仍然被告诉"请选择胜方"。
   *
   * 现在整个填写区都在**一个** form 里，胜方是带 name 的 radio group
   * （规范 §9.3 也要求 winner 用 radio group 而不是下拉框）。
   */
  const [winnerTeamId, setWinnerTeamId] = useState(context.winnerTeamId ?? "");
  const [reasonForDecision, setReasonForDecision] = useState(context.reasonForDecision ?? "");
  const [confirming, setConfirming] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);

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

  /*
   * 提交前的自查。用**当前状态**算出来，因此裁判在点提交之前就能看到还缺什么，
   * 而不是提交失败之后被一次性告知。
   */
  const review = reviewBallot({
    schema: context.schema,
    speakerValues: JSON.parse(speakerScoresJson) as Record<string, Record<string, unknown>>,
    otherValues: JSON.parse(otherValuesJson) as Record<string, unknown>,
    speakers: context.speakers,
    teams: context.teams,
    winnerTeamId: winnerTeamId || null,
    reasonForDecision,
  });

  return (
    <div className="flex flex-col gap-4">
      {/*
        规范 §9.3 第 1 条：「Sticky round summary」。
        一份评分表要往下滚很久（每位发言者一组字段），
        摘要跟着滚，裁判随时知道自己在评哪一场 —— 手里可能开着好几场。
      */}
      <div className="border-border bg-background/95 supports-[backdrop-filter]:bg-background/80 sticky top-0 z-10 -mx-1 rounded-md border px-3 py-2 backdrop-blur">
        <p className="text-sm font-medium">
          第 {context.matchNumber} 场 · {context.roomName}
          <span className="text-muted-foreground ml-2 text-xs font-normal">
            {context.formatCode} · {context.templateName}
          </span>
        </p>
        <p className="text-muted-foreground text-xs">
          {utcToZonedLocal(new Date(context.scheduledStart), CLUB_DEFAULT_TIMEZONE).replace(
            "T",
            " ",
          )}
          （{CLUB_DEFAULT_TIMEZONE}）
          {context.ballotStatus ? ` · 当前状态：${context.ballotStatus}` : ""}
        </p>
      </div>

      {/*
        ⚠️ 整个填写区必须在**同一个 form 里**。
        这里原来是把每个 `<form>` 只套在按钮上、把所有输入框留在外面，
        于是 `winnerTeamId` 与 `reasonForDecision` 从来没有被提交过。
      */}
      <form ref={formRef} action={submitAction} className="flex flex-col gap-4">
        {/* 动态字段靠隐藏字段交给服务端（字段是模板生成的，服务端无法预知 name） */}
        <input type="hidden" name="matchId" value={context.matchId} />
        <input type="hidden" name="speakerScoresJson" value={speakerScoresJson} />
        <input type="hidden" name="otherValuesJson" value={otherValuesJson} />

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
                          (context.data.speakerValues[speaker.studentId]?.[field.key] as string) ??
                          ""
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
                          (context.data.speakerValues[speaker.studentId]?.[field.key] as string) ??
                          ""
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
                    (context.data.matchValues[field.key] as Record<string, number> | undefined) ??
                    {}
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
            {/*
            规范 §9.3：「radio group for winner」。
            用 radio 而不是下拉框：选项通常只有 2–4 个，铺开更少一次点击，
            而且**看得见自己选的是哪个** —— 判决是这份表里最不该看错的一项。

            ⚠️ 每个 radio 都必须有 `name`（原来那个 select 就是漏了 name，
            于是胜方从来没被提交过，导致 PF 根本提交不了）。
          */}
            {context.schema.winnerRequired ? (
              <fieldset className="mb-3">
                <legend className="text-xs">胜方</legend>
                <div className="mt-1 flex flex-wrap gap-x-5 gap-y-2">
                  {context.teams.map((team) => {
                    const id = `winner-${team.teamId}`;
                    return (
                      <label
                        key={team.teamId}
                        htmlFor={id}
                        className="flex items-center gap-2 text-sm"
                      >
                        <input
                          id={id}
                          type="radio"
                          name="winnerTeamId"
                          value={team.teamId}
                          checked={winnerTeamId === team.teamId}
                          disabled={busy || readOnly}
                          onChange={() => setWinnerTeamId(team.teamId)}
                          className="accent-primary size-4"
                        />
                        {team.teamLabel ?? team.position}
                      </label>
                    );
                  })}
                </div>
              </fieldset>
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
                  value={reasonForDecision}
                  onChange={(event) => setReasonForDecision(event.target.value)}
                  aria-describedby="reasonForDecision-hint"
                  className="border-input bg-background max-w-xl rounded-md border px-3 py-2 text-sm"
                />
                <p id="reasonForDecision-hint" className="text-muted-foreground text-xs">
                  建议至少 100 字；不到也可以提交，理由写得清不清楚比字数重要。 已写{" "}
                  {review.reasonLength} 字。
                </p>
              </div>
            ) : null}
          </fieldset>
        ) : null}

        <FormMessage status={draftState.status} message={draftState.message} />
        <FormMessage status={submitState.status} message={submitState.message} />

        {!readOnly ? (
          <div className="flex flex-wrap items-center gap-3">
            {/*
            "保存草稿"与"提交"共用**同一个表单**：
            草稿按钮通过 `formAction` 换成保存动作。

            ⚠️ 原来这里是**两个只装着隐藏字段的小 <form>**，而所有真正的输入框
            （分数、胜方、判决理由）都在它们**外面** —— 于是胜方与判决理由
            从来没有被提交过。服务端要求这两项必填，结果是 PF 这类赛制
            **根本提交不了**：裁判选完胜方、写完理由，点提交仍然被告知"请选择胜方"。

            草稿仍然永远可用：保存动作不做内容校验（裁判是边听边记的）。
          */}
            <Button type="submit" formAction={draftAction} variant="outline" disabled={busy}>
              {savingDraft ? "保存中…" : "保存草稿"}
            </Button>
            <Button type="button" disabled={busy} onClick={() => setConfirming(true)}>
              提交评分表
            </Button>
          </div>
        ) : null}

        {/*
        规范 §9.3：「Submission dialog summarises the decision and warns that
        editing may be locked.」

        用**表单内**的一步确认，而不是浏览器弹窗：它可读、可聚焦、
        而且确认按钮就是一个普通的 type="submit"，因此提交仍然走服务端动作。
      */}
        {confirming && !readOnly ? (
          <section
            aria-labelledby="submit-confirm-heading"
            className="border-border bg-muted/40 rounded-md border px-4 py-4"
          >
            <h2 id="submit-confirm-heading" className="text-sm font-medium">
              确认提交这份评分表？
            </h2>
            <dl className="mt-2 flex flex-col gap-1 text-sm">
              <div className="flex gap-2">
                <dt className="text-muted-foreground">胜方</dt>
                <dd>{review.winnerLabel ?? "（还没有选）"}</dd>
              </div>
              <div className="flex gap-2">
                <dt className="text-muted-foreground">判决理由</dt>
                <dd>
                  {review.reasonLength > 0 ? `已写 ${review.reasonLength} 字` : "（还没有写）"}
                </dd>
              </div>
            </dl>

            {review.missing.length > 0 ? (
              <div className="mt-3">
                <p className="text-warning text-sm" role="alert">
                  还有 {review.missing.length} 项必填内容没填，现在提交会被服务端拒绝：
                </p>
                <ul className="text-muted-foreground mt-1 list-disc pl-5 text-xs">
                  {review.missing.slice(0, 8).map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
                {review.missing.length > 8 ? (
                  <p className="text-muted-foreground mt-1 text-xs">
                    还有 {review.missing.length - 8} 项……
                  </p>
                ) : null}
              </div>
            ) : (
              <p className="text-sm">必填内容看起来都填齐了。</p>
            )}

            <p className="text-muted-foreground mt-3 text-xs">
              提交之后这份评分表**不能直接修改**；如需更正，要请管理员重开。
            </p>

            <div className="mt-3 flex flex-wrap items-center gap-3">
              <Button type="submit" disabled={busy}>
                {submitting ? "提交中…" : "确认提交"}
              </Button>
              <Button type="button" variant="outline" onClick={() => setConfirming(false)}>
                返回检查
              </Button>
            </div>
          </section>
        ) : null}
      </form>
    </div>
  );
}
