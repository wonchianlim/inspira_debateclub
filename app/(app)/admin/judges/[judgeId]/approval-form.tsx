"use client";

import { useActionState } from "react";

import { FormMessage } from "@/components/domain/form-message";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { updateJudgeApprovalAction } from "@/lib/admin/judge-actions";
import {
  JUDGE_APPROVAL_DESCRIPTIONS,
  JUDGE_APPROVAL_LABELS,
  JUDGE_APPROVAL_STATUSES,
  type JudgeApprovalStatus,
} from "@/lib/domain/judge-eligibility";
import { INITIAL_FORM_STATE } from "@/lib/forms/form-state";

export function ApprovalForm({
  judgeProfileId,
  currentStatus,
}: {
  judgeProfileId: string;
  currentStatus: JudgeApprovalStatus;
}) {
  const [state, formAction, pending] = useActionState(
    updateJudgeApprovalAction,
    INITIAL_FORM_STATE,
  );

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <input type="hidden" name="judgeProfileId" value={judgeProfileId} />
      <FormMessage status={state.status} message={state.message} />

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="approvalStatus">审批状态</Label>
        <select
          id="approvalStatus"
          name="approvalStatus"
          defaultValue={currentStatus}
          disabled={pending}
          aria-describedby="approval-hint"
          className="border-input bg-background focus-visible:border-ring focus-visible:ring-ring/50 h-9 w-full max-w-sm rounded-md border px-3 text-sm focus-visible:ring-3 focus-visible:outline-none disabled:opacity-50"
        >
          {JUDGE_APPROVAL_STATUSES.map((status) => (
            <option key={status} value={status}>
              {JUDGE_APPROVAL_LABELS[status]}
            </option>
          ))}
        </select>
      </div>

      <dl id="approval-hint" className="text-muted-foreground flex flex-col gap-1 text-xs">
        {JUDGE_APPROVAL_STATUSES.map((status) => (
          <div key={status} className="flex gap-2">
            <dt className="text-foreground w-16 shrink-0">{JUDGE_APPROVAL_LABELS[status]}</dt>
            <dd>{JUDGE_APPROVAL_DESCRIPTIONS[status]}</dd>
          </div>
        ))}
      </dl>

      <Button type="submit" disabled={pending} className="self-start">
        {pending ? "保存中…" : "保存审批状态"}
      </Button>
    </form>
  );
}
