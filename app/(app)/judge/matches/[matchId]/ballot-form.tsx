"use client";

import Link from "next/link";
import { useActionState, useCallback, useEffect, useRef, useState } from "react";

import { FormMessage } from "@/components/domain/form-message";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { BallotField } from "@/lib/domain/ballot-schema";
import {
  AUTOSAVE_IDLE_MS,
  AUTOSAVE_MAX_RETRIES,
  AUTOSAVE_RETRY_MS,
  autosaveLabel,
  canAutosave,
  withExpectedVersion,
  type AutosaveStatus,
} from "@/lib/domain/ballot-autosave";
import { reviewBallot } from "@/lib/domain/ballot-review";
import type { BallotContext } from "@/lib/judge/ballots";
import { saveBallotDraftAction, submitBallotAction } from "@/lib/judge/ballot-actions";
import { INITIAL_FORM_STATE, type BallotDraftState } from "@/lib/forms/form-state";
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
  const itemLabel = field.itemLabel ?? "Entry";
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
          ({field.minItems ?? 1} to {maxItems} entries)
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
              aria-label={`${field.label} entry ${index + 1}`}
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
                Remove
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
          + Add {itemLabel}
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
          (one rank per team, no duplicates)
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
              aria-label={`Team for ${label}`}
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
              <option value="">Choose</option>
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
  /*
   * 草稿保存**不用** `useActionState`，而是显式调用服务端动作。
   *
   * 原因：乐观并发要求"保存成功后立刻记住服务端给的新版本"。
   * 用 `useActionState` 只能通过一个 `useEffect` 去读它的返回值，
   * 而那会触发 React 的 `set-state-in-effect` 规则（也确实容易产生级联渲染）。
   * 显式 `await` 之后直接更新状态，链路短、也没有时序猜测。
   *
   * 提交仍然走表单动作（`useActionState`），因此**没有 JS 也能提交** ——
   * 那是最关键的动作。自动保存本来就需要 JS。
   */
  const [draftState, setDraftState] = useState<BallotDraftState>(INITIAL_FORM_STATE);
  const [savingDraft, setSavingDraft] = useState(false);
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

  /*
   * 自动保存（规范 §9.3）：
   *   "Autosave after a short idle period and on field blur."
   *
   * ⚠️ `savedVersion` 是**乐观并发**的关键：它就是"我读到的服务端版本"。
   * 每次保存成功后换成服务端给的新版本；一旦服务端说版本不一致，
   * 状态变成 `conflict`，而 `canAutosave()` 会**拒绝继续自动保存** ——
   * 否则裁判在两个窗口之间每打一个字都会覆盖对方的修改
   * （规范："never silently overwrite a newer ballot"）。
   */
  const [autosave, setAutosave] = useState<AutosaveStatus>("idle");
  const [savedVersion, setSavedVersion] = useState<string | null>(context.updatedAt);
  const [savedAt, setSavedAt] = useState<Date | null>(null);
  const idleTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  /*
   * 重试计数用 state 而不是 ref：它要参与渲染（"重试了太多次"时给手动按钮），
   * 而 React 的规则不允许在渲染期间读 ref。
   */
  const [retryCount, setRetryCount] = useState(0);

  const clearIdleTimer = useCallback(() => {
    if (idleTimer.current) {
      clearTimeout(idleTimer.current);
      idleTimer.current = null;
    }
  }, []);

  /**
   * 立刻保存一次。`override` 表示裁判已看过冲突提示、明确选择覆盖。
   *
   * ⚠️ 数据来自 `new FormData(formRef.current)` —— 也就是**界面上真正的内容**，
   * 因此自动保存与手动点"保存草稿"走的是完全同一条路。
   */
  const saveNow = useCallback(
    async (override = false) => {
      if (readOnly || !formRef.current || savingDraft) return;
      clearIdleTimer();
      setSavingDraft(true);
      setAutosave("saving");
      try {
        const data = withExpectedVersion(new FormData(formRef.current), savedVersion, override);
        const next = await saveBallotDraftAction(draftState, data);
        setDraftState(next);

        if (next.conflict) {
          // ⚠️ 冲突**绝不重试** —— 重试就是在反复覆盖别人的修改
          setRetryCount(0);
          setAutosave("conflict");
          return;
        }
        if (next.status === "success") {
          setRetryCount(0);
          // 记住服务端给的新版本，否则下一次自动保存会拿着旧版本、立刻又冲突
          setSavedVersion(next.version ?? null);
          setSavedAt(new Date());
          setAutosave("saved");
          return;
        }
        // 失败：自动重试有限次，之后停下来等裁判手动点（规范："Couldn't save—retrying"）
        if (retryCount < AUTOSAVE_MAX_RETRIES) {
          setRetryCount((count) => count + 1);
          setAutosave("failed");
          idleTimer.current = setTimeout(() => {
            void saveNow();
          }, AUTOSAVE_RETRY_MS);
        } else {
          setAutosave("failed");
        }
      } finally {
        setSavingDraft(false);
      }
    },
    [clearIdleTimer, draftState, readOnly, retryCount, savedVersion, savingDraft],
  );

  /** 有改动时调用：进入"待保存"，并重置空闲计时器。 */
  const scheduleAutosave = useCallback(() => {
    setAutosave((current) => (current === "conflict" ? current : "pending"));
    clearIdleTimer();
    if (!canAutosave(autosave)) return;
    idleTimer.current = setTimeout(() => saveNow(), AUTOSAVE_IDLE_MS);
  }, [autosave, clearIdleTimer, saveNow]);

  useEffect(() => clearIdleTimer, [clearIdleTimer]);

  const autosaveText = autosaveLabel(autosave, savedAt, (instant) =>
    utcToZonedLocal(instant, CLUB_DEFAULT_TIMEZONE).slice(11),
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
          Round {context.matchNumber} · {context.roomName}
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
          {context.ballotStatus ? ` · Status: ${context.ballotStatus}` : ""}
        </p>
      </div>

      {/*
        ⚠️ 整个填写区必须在**同一个 form 里**。
        这里原来是把每个 `<form>` 只套在按钮上、把所有输入框留在外面，
        于是 `winnerTeamId` 与 `reasonForDecision` 从来没有被提交过。
      */}
      {/*
        ⚠️ 失焦立刻保存（规范："on field blur"）。
        用 form 上的 `onBlur` 冒泡即可，不必给每个输入框挂一遍。
      */}
      <form
        ref={formRef}
        action={submitAction}
        className="flex flex-col gap-4"
        onBlur={() => {
          if (!readOnly && (autosave === "pending" || autosave === "failed")) {
            clearIdleTimer();
            saveNow();
          }
        }}
      >
        {/* 动态字段靠隐藏字段交给服务端（字段是模板生成的，服务端无法预知 name） */}
        <input type="hidden" name="matchId" value={context.matchId} />
        <input type="hidden" name="speakerScoresJson" value={speakerScoresJson} />
        <input type="hidden" name="otherValuesJson" value={otherValuesJson} />

        {/* 自动保存的状态（规范点名的三个说法：正在保存 / 刚刚已保存 / 没能保存） */}
        {!readOnly && autosaveText ? (
          <p className="text-muted-foreground text-xs" role="status" aria-live="polite">
            {autosaveText}
          </p>
        ) : null}

        {/*
          版本冲突：**不再自动保存**，由裁判决定。
          规范要求 "never **silently** overwrite a newer ballot" ——
          悄悄覆盖不行，说清楚了让他选可以。
        */}
        {autosave === "failed" && retryCount >= AUTOSAVE_MAX_RETRIES ? (
          <div className="border-border flex flex-wrap items-center gap-3 rounded-md border px-3 py-2 text-sm">
            <span>Could not save after several tries. Your work is still on this page.</span>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => {
                setRetryCount(0);
                void saveNow();
              }}
            >
              Try saving again
            </Button>
          </div>
        ) : null}

        {autosave === "conflict" ? (
          <div className="border-warning bg-warning-bg rounded-md border px-3 py-3 text-sm">
            <p className="font-medium">This ballot changed elsewhere, so autosave has stopped</p>
            <p className="text-muted-foreground mt-1 text-xs">
              Continuing to autosave would overwrite what the other side just wrote, so it stopped.
              Your work is still on this page. Choose one:
            </p>
            <div className="mt-2 flex flex-wrap items-center gap-3">
              <Link
                href={`/judge/matches/${context.matchId}`}
                className="focus-visible:ring-ring/50 rounded text-sm underline underline-offset-4 focus-visible:ring-3 focus-visible:outline-none"
              >
                Load the latest version (discard my changes)
              </Link>
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={busy}
                onClick={() => saveNow(true)}
              >
                Keep my version
              </Button>
            </div>
          </div>
        ) : null}

        <p className="text-muted-foreground text-sm">{BALLOT_DRAFT_NOTE}</p>

        {readOnly ? (
          /*
            规范 §9.3："After success, show immutable submitted view with
            **timestamp and reference ID**."（任何允许的更正都必须留下审计事件 ——
            那是管理员"重开"那条流程的事。）
          */
          <div className="border-border rounded-md border px-3 py-3 text-sm">
            <p>
              This ballot is submitted and is now “{context.ballotStatus}”. It cannot be edited
              directly; to correct it, ask an administrator to reopen it.
            </p>
            <dl className="text-muted-foreground mt-2 flex flex-wrap gap-x-6 gap-y-1 text-xs">
              {context.submittedAt ? (
                <div className="flex gap-1">
                  <dt>Submitted</dt>
                  <dd className="text-foreground">
                    {utcToZonedLocal(new Date(context.submittedAt), CLUB_DEFAULT_TIMEZONE).replace(
                      "T",
                      " ",
                    )}{" "}
                    （{CLUB_DEFAULT_TIMEZONE}）
                  </dd>
                </div>
              ) : null}
              {context.ballotId ? (
                <div className="flex gap-1">
                  <dt>Ballot ID</dt>
                  {/* 等宽字体：裁判把编号抄给管理员时不该看错字母 */}
                  <dd className="text-foreground font-mono">{context.ballotId}</dd>
                </div>
              ) : null}
            </dl>
          </div>
        ) : null}

        {context.speakers.map((speaker) => {
          const fields = fieldsForSpeaker(speaker.speakerPosition);
          return (
            <fieldset key={speaker.studentId} className="border-border rounded-md border px-3 py-3">
              <legend className="px-1 text-sm font-medium">
                {speaker.displayName}
                {speaker.speakerPosition > 0 ? (
                  <span className="text-muted-foreground ml-2 text-xs">
                    Speaker {speaker.speakerPosition}
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
                        onChange={(event) => {
                          updateSpeaker(speaker.studentId, field.key, event.target.value);
                          scheduleAutosave();
                        }}
                        className="border-input bg-background h-9 w-56 rounded-md border px-2 text-sm"
                      >
                        <option value="">Choose</option>
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
                        onChange={(event) => {
                          updateSpeaker(speaker.studentId, field.key, event.target.value);
                          scheduleAutosave();
                        }}
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
            <legend className="px-1 text-sm font-medium">By team</legend>
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
                      onChange={(entries) => {
                        updateOther(`${team.teamId}|${field.key}`, JSON.stringify(entries));
                        scheduleAutosave();
                      }}
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
                        onChange={(event) => {
                          updateOther(`${team.teamId}|${field.key}`, event.target.value);
                          scheduleAutosave();
                        }}
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
            <legend className="px-1 text-sm font-medium">Whole round</legend>
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
                  onChange={(value) => {
                    updateOther(field.key, JSON.stringify(value));
                    scheduleAutosave();
                  }}
                />
              ) : field.type === "list" ? (
                <ListField
                  key={field.key}
                  field={field}
                  entries={readMatchList(context, field.key)}
                  disabled={busy || readOnly}
                  onChange={(entries) => {
                    updateOther(field.key, JSON.stringify(entries));
                    scheduleAutosave();
                  }}
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
                    onChange={(event) => {
                      updateOther(field.key, event.target.value);
                      scheduleAutosave();
                    }}
                    className="border-input bg-background h-9 max-w-72 rounded-md border px-2 text-sm"
                  >
                    <option value="">Choose</option>
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
                        (at least {field.minLength} characters suggested)
                      </span>
                    ) : null}
                  </Label>
                  <textarea
                    id={`match-${field.key}`}
                    rows={field.key === "reason_for_decision" ? 5 : 3}
                    disabled={busy || readOnly}
                    defaultValue={(context.data.matchValues[field.key] as string) ?? ""}
                    onChange={(event) => {
                      updateOther(field.key, event.target.value);
                      scheduleAutosave();
                    }}
                    className="border-input bg-background max-w-2xl rounded-md border px-3 py-2 text-sm"
                  />
                </div>
              ),
            )}
          </fieldset>
        ) : null}

        {context.schema.winnerRequired || context.schema.reasonForDecisionRequired ? (
          <fieldset className="border-border rounded-md border px-3 py-3">
            <legend className="px-1 text-sm font-medium">Decision</legend>
            {/*
            规范 §9.3：「radio group for winner」。
            用 radio 而不是下拉框：选项通常只有 2–4 个，铺开更少一次点击，
            而且**看得见自己选的是哪个** —— 判决是这份表里最不该看错的一项。

            ⚠️ 每个 radio 都必须有 `name`（原来那个 select 就是漏了 name，
            于是胜方从来没被提交过，导致 PF 根本提交不了）。
          */}
            {context.schema.winnerRequired ? (
              <fieldset className="mb-3">
                <legend className="text-xs">Winner</legend>
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
                          onChange={() => {
                            setWinnerTeamId(team.teamId);
                            scheduleAutosave();
                          }}
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
                  Reason for decision
                </Label>
                <textarea
                  id="reasonForDecision"
                  name="reasonForDecision"
                  rows={3}
                  disabled={busy || readOnly}
                  value={reasonForDecision}
                  onChange={(event) => {
                    setReasonForDecision(event.target.value);
                    scheduleAutosave();
                  }}
                  aria-describedby="reasonForDecision-hint"
                  className="border-input bg-background max-w-xl rounded-md border px-3 py-2 text-sm"
                />
                <p id="reasonForDecision-hint" className="text-muted-foreground text-xs">
                  100 characters or more is suggested, but a shorter one can still be submitted:
                  clarity matters more than length. {review.reasonLength} characters so far.
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
            <Button
              type="button"
              variant="outline"
              disabled={busy}
              onClick={() => {
                void saveNow();
              }}
            >
              {savingDraft ? "Saving…" : "Save draft"}
            </Button>
            <Button type="button" disabled={busy} onClick={() => setConfirming(true)}>
              Submit ballot
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
              Submit this ballot?
            </h2>
            <dl className="mt-2 flex flex-col gap-1 text-sm">
              <div className="flex gap-2">
                <dt className="text-muted-foreground">Winner</dt>
                <dd>{review.winnerLabel ?? "(not chosen yet)"}</dd>
              </div>
              <div className="flex gap-2">
                <dt className="text-muted-foreground">Reason</dt>
                <dd>
                  {review.reasonLength > 0
                    ? `${review.reasonLength} characters written`
                    : "(nothing written yet)"}
                </dd>
              </div>
            </dl>

            {review.missing.length > 0 ? (
              <div className="mt-3">
                <p className="text-warning text-sm" role="alert">
                  {review.missing.length} required items are still missing; submitting now will be
                  refused:
                </p>
                <ul className="text-muted-foreground mt-1 list-disc pl-5 text-xs">
                  {review.missing.slice(0, 8).map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
                {review.missing.length > 8 ? (
                  <p className="text-muted-foreground mt-1 text-xs">
                    and {review.missing.length - 8} more…
                  </p>
                ) : null}
              </div>
            ) : (
              <p className="text-sm">Everything required looks filled in.</p>
            )}

            <p className="text-muted-foreground mt-3 text-xs">
              After submitting, this ballot cannot be edited directly; ask an administrator to
              reopen it if it needs correcting.
            </p>

            <div className="mt-3 flex flex-wrap items-center gap-3">
              <Button type="submit" disabled={busy}>
                {submitting ? "Submitting…" : "Confirm and submit"}
              </Button>
              <Button type="button" variant="outline" onClick={() => setConfirming(false)}>
                Back to the ballot
              </Button>
            </div>
          </section>
        ) : null}
      </form>
    </div>
  );
}
