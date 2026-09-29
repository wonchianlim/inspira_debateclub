"use client";

import { useActionState } from "react";

import { FormMessage } from "@/components/domain/form-message";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { updateProfileStatusAction } from "@/lib/admin/actions";
import { INITIAL_FORM_STATE } from "@/lib/forms/form-state";
import {
  PROFILE_STATUSES,
  PROFILE_STATUS_DESCRIPTIONS,
  PROFILE_STATUS_LABELS,
  type ProfileStatus,
} from "@/lib/validation/admin";

export function StatusForm({
  profileId,
  currentStatus,
  disabled,
  disabledReason,
}: {
  profileId: string;
  currentStatus: ProfileStatus;
  /** 例如"这是你自己的账号"——此时不允许提交 */
  disabled?: boolean;
  disabledReason?: string;
}) {
  const [state, formAction, pending] = useActionState(
    updateProfileStatusAction,
    INITIAL_FORM_STATE,
  );

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <input type="hidden" name="profileId" value={profileId} />
      <FormMessage status={state.status} message={state.message} />

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="status">账号状态</Label>
        <select
          id="status"
          name="status"
          defaultValue={currentStatus}
          disabled={disabled || pending}
          aria-describedby="status-hint"
          className="border-input bg-background focus-visible:border-ring focus-visible:ring-ring/50 h-9 w-full max-w-sm rounded-md border px-3 text-sm focus-visible:ring-3 focus-visible:outline-none disabled:opacity-50"
        >
          {PROFILE_STATUSES.map((status) => (
            <option key={status} value={status}>
              {PROFILE_STATUS_LABELS[status]}
            </option>
          ))}
        </select>
      </div>

      {/*
        把三种状态的含义写在界面上，而不是只给一个下拉框。
        非技术管理员需要知道"停用"和"暂停"到底有什么区别。
      */}
      <dl id="status-hint" className="text-muted-foreground flex flex-col gap-1 text-xs">
        {PROFILE_STATUSES.map((status) => (
          <div key={status} className="flex gap-2">
            <dt className="text-foreground w-16 shrink-0">{PROFILE_STATUS_LABELS[status]}</dt>
            <dd>{PROFILE_STATUS_DESCRIPTIONS[status]}</dd>
          </div>
        ))}
      </dl>

      {disabled ? (
        <p className="text-muted-foreground text-xs" role="note">
          {disabledReason}
        </p>
      ) : null}

      <Button type="submit" disabled={disabled || pending} className="self-start">
        {pending ? "保存中…" : "保存状态"}
      </Button>
    </form>
  );
}
