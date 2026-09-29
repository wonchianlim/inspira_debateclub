"use client";

import { useActionState } from "react";

import { FormMessage } from "@/components/domain/form-message";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { updateScheduleSettingsAction } from "@/lib/admin/settings-actions";
import { INITIAL_FORM_STATE } from "@/lib/forms/form-state";
import type { ScheduleSettingsInput } from "@/lib/validation/settings";

/** 四个设置项的元数据：标签、说明与单位。用数据驱动渲染，避免四段重复代码。 */
const FIELDS: {
  name: keyof ScheduleSettingsInput;
  label: string;
  hint: string;
  unit: string;
}[] = [
  {
    name: "registrationOpensDaysBefore",
    label: "报名提前开放",
    hint: "活动开始前多少天开放报名。",
    unit: "天",
  },
  {
    name: "registrationClosesDaysBefore",
    label: "报名提前截止",
    hint: "活动开始前多少天截止报名。必须小于上面的「开放」天数。",
    unit: "天",
  },
  {
    name: "checkInOpensMinutesBefore",
    label: "签到提前开放",
    hint: "活动开始前多少分钟开放签到。规范默认 30 分钟。",
    unit: "分钟",
  },
  {
    name: "warningMinutesBefore",
    label: "警示提前",
    hint: "活动开始前多少分钟开始标出还没到齐的房间。",
    unit: "分钟",
  },
];

export function SettingsForm({ current }: { current: ScheduleSettingsInput }) {
  const [state, formAction, pending] = useActionState(
    updateScheduleSettingsAction,
    INITIAL_FORM_STATE,
  );
  const error = (name: string) => state.fieldErrors?.[name]?.[0];

  return (
    <form action={formAction} className="flex flex-col gap-5">
      <FormMessage status={state.status} message={state.message} />

      {FIELDS.map((field) => {
        const message = error(field.name);
        const id = String(field.name);
        return (
          <div key={field.name} className="flex flex-col gap-1.5">
            <Label htmlFor={id}>{field.label}</Label>
            <div className="flex items-center gap-2">
              <Input
                id={id}
                name={id}
                type="number"
                min={0}
                step={1}
                inputMode="numeric"
                defaultValue={current[field.name]}
                disabled={pending}
                aria-invalid={message ? true : undefined}
                aria-describedby={message ? `${id}-error` : `${id}-hint`}
                className="max-w-32"
              />
              <span className="text-muted-foreground text-sm">{field.unit}</span>
            </div>
            {message ? (
              <p id={`${id}-error`} role="alert" className="text-destructive text-xs">
                {message}
              </p>
            ) : (
              <p id={`${id}-hint`} className="text-muted-foreground text-xs">
                {field.hint}
              </p>
            )}
          </div>
        );
      })}

      <Button type="submit" disabled={pending} className="self-start">
        {pending ? "保存中…" : "保存设置"}
      </Button>

      <p className="text-muted-foreground text-xs">
        这些是**新建活动时的默认值**，不是硬性规则 —— 每个活动都可以在它自己的页面上单独修改。
      </p>
    </form>
  );
}
