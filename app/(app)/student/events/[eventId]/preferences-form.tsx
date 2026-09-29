"use client";

import { useActionState } from "react";

import { FormMessage } from "@/components/domain/form-message";
import { Button } from "@/components/ui/button";
import { INITIAL_FORM_STATE } from "@/lib/forms/form-state";
import { saveFormatPreferencesAction } from "@/lib/student/registration-actions";
import type { StudentFormatChoice } from "@/lib/student/registrations";

/**
 * 赛制偏好。
 *
 * 用**复选框 + 数字输入**表示顺序，而不是拖拽：拖拽在键盘与屏幕阅读器下很难用，
 * 而这个表单必须让所有人都能操作。
 *
 * 不可选的赛制也会显示出来，并写明**原因**（活动没开 / 你没有资格）——
 * 直接藏起来会让学生以为系统坏了。
 */
export function PreferencesForm({
  registrationId,
  formats,
}: {
  registrationId: string;
  formats: StudentFormatChoice[];
}) {
  const [state, formAction, pending] = useActionState(
    saveFormatPreferencesAction,
    INITIAL_FORM_STATE,
  );

  const selectable = formats.filter((f) => f.eventFormatEnabled && f.studentEligible);
  const blocked = formats.filter((f) => !(f.eventFormatEnabled && f.studentEligible));

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <input type="hidden" name="registrationId" value={registrationId} />
      <FormMessage status={state.status} message={state.message} />

      {selectable.length === 0 ? (
        <p className="text-muted-foreground text-sm" role="note">
          本次活动目前没有任何你可以参加的赛制。请联系管理员确认你的赛制资格。
        </p>
      ) : (
        <>
          <p className="text-muted-foreground text-sm">
            勾选你想参加的赛制，并用数字填写优先顺序（1 是最想参加的）。填错顺序不会报错，
            但配对时会参考这个顺序。保存时会以这里填的编号为准。
          </p>
          <fieldset className="flex flex-col gap-3" disabled={pending}>
            <legend className="sr-only">赛制偏好</legend>
            {selectable.map((format) => (
              <div key={format.formatId} className="flex items-center gap-3">
                <input
                  type="checkbox"
                  id={`format-${format.formatId}`}
                  name="formatIds"
                  value={format.formatId}
                  defaultChecked={format.myPreferenceRank !== null}
                  className="accent-primary size-4"
                />
                <label htmlFor={`format-${format.formatId}`} className="flex-1 text-sm">
                  {format.code} · {format.name}
                </label>
                <label className="text-muted-foreground flex items-center gap-1 text-xs">
                  优先
                  <input
                    type="number"
                    /* ⚠️ 必须带 name，否则这个数字不会被提交，顺序就成了摆设 */
                    name={`priority-${format.formatId}`}
                    min={1}
                    max={20}
                    defaultValue={format.myPreferenceRank ?? ""}
                    aria-label={`${format.code} 的优先顺序`}
                    className="border-input bg-background h-8 w-16 rounded-md border px-2 text-sm"
                  />
                </label>
              </div>
            ))}
          </fieldset>
          <Button type="submit" disabled={pending} className="self-start">
            {pending ? "保存中…" : "保存赛制偏好"}
          </Button>
        </>
      )}

      {blocked.length > 0 ? (
        <div className="border-border rounded-md border px-3 py-2">
          <p className="text-muted-foreground mb-1 text-xs font-medium">以下赛制你暂时不能选择：</p>
          <ul className="text-muted-foreground flex flex-col gap-0.5 text-xs">
            {blocked.map((format) => (
              <li key={format.formatId}>
                {format.code} · {format.name} ——{" "}
                {format.eventFormatEnabled
                  ? "你还没有获得这个赛制的资格"
                  : "本次活动没有开设这个赛制"}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </form>
  );
}
