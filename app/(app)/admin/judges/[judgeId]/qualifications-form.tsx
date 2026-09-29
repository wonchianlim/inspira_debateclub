"use client";

import { useActionState } from "react";

import { FormMessage } from "@/components/domain/form-message";
import { Button } from "@/components/ui/button";
import { setJudgeQualificationsAction } from "@/lib/admin/judge-actions";
import type { FormatOption } from "@/lib/admin/formats";
import { INITIAL_FORM_STATE } from "@/lib/forms/form-state";

export function QualificationsForm({
  judgeProfileId,
  formats,
  approvedFormatIds,
  disabled,
  disabledReason,
}: {
  judgeProfileId: string;
  formats: FormatOption[];
  approvedFormatIds: string[];
  /** 审批状态不是"已批准"时，勾选资格没有意义，直接禁用 */
  disabled?: boolean;
  disabledReason?: string;
}) {
  const [state, formAction, pending] = useActionState(
    setJudgeQualificationsAction,
    INITIAL_FORM_STATE,
  );

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <input type="hidden" name="judgeProfileId" value={judgeProfileId} />
      <FormMessage status={state.status} message={state.message} />

      <fieldset className="flex flex-col gap-3" disabled={disabled || pending}>
        <legend className="sr-only">赛制资格</legend>

        {formats.map((format) => (
          <div key={format.id} className="flex items-start gap-3">
            <input
              type="checkbox"
              id={`format-${format.id}`}
              name="formatIds"
              value={format.id}
              defaultChecked={approvedFormatIds.includes(format.id)}
              className="accent-primary mt-1 size-4"
            />
            <div className="flex flex-col gap-0.5">
              <label htmlFor={`format-${format.id}`} className="text-sm font-medium">
                {format.code} · {format.name}
              </label>
              <span className="text-muted-foreground text-xs">
                {format.teamSize} 人一队，每场 {format.teamsPerMatch} 队
                {format.active ? "" : "（该赛制已停用，仍可维护历史资格）"}
              </span>
            </div>
          </div>
        ))}
      </fieldset>

      {disabled ? (
        <p className="text-muted-foreground text-xs" role="note">
          {disabledReason}
        </p>
      ) : null}

      <Button type="submit" disabled={disabled || pending} className="self-start">
        {pending ? "保存中…" : "保存赛制资格"}
      </Button>

      <p className="text-muted-foreground text-xs">
        取消勾选会<strong>撤销</strong>该赛制的资格。撤销后这位裁判就不能再被指派到该赛制。
      </p>
    </form>
  );
}
