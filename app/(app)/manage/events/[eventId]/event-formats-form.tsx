"use client";

import { useActionState } from "react";

import { FormMessage } from "@/components/domain/form-message";
import { Button } from "@/components/ui/button";
import { setEventFormatsAction } from "@/lib/admin/event-actions";
import type { FormatOption } from "@/lib/admin/formats";
import { INITIAL_FORM_STATE } from "@/lib/forms/form-state";

/**
 * 设置本活动启用哪些赛制。
 *
 * 语义：勾选 = 本活动开这个赛制。未勾选的赛制在本活动中不可报名（Phase 3 生效）。
 * 停用某个赛制**不会**删除它已有的报名记录（后续阶段的数据），只是不再接受新的报名。
 */
export function EventFormatsForm({
  eventId,
  formats,
  enabledFormatIds,
}: {
  eventId: string;
  formats: FormatOption[];
  enabledFormatIds: string[];
}) {
  const [state, formAction, pending] = useActionState(setEventFormatsAction, INITIAL_FORM_STATE);

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <input type="hidden" name="eventId" value={eventId} />
      <FormMessage status={state.status} message={state.message} />

      <fieldset className="flex flex-col gap-3" disabled={pending}>
        <legend className="sr-only">Formats enabled for this event</legend>

        {formats.map((format) => (
          <div key={format.id} className="flex items-start gap-3">
            <input
              type="checkbox"
              id={`event-format-${format.id}`}
              name="enabledFormatIds"
              value={format.id}
              defaultChecked={enabledFormatIds.includes(format.id)}
              className="accent-primary mt-1 size-4"
            />
            <div className="flex flex-col gap-0.5">
              <label htmlFor={`event-format-${format.id}`} className="text-sm font-medium">
                {format.code} · {format.name}
              </label>
              <span className="text-muted-foreground text-xs">
                {format.teamSize} per team, {format.teamsPerMatch} teams per round
                {format.active ? "" : " (globally disabled; better not to enable it here)"}
              </span>
            </div>
          </div>
        ))}
      </fieldset>

      <Button type="submit" disabled={pending} className="self-start">
        {pending ? "Saving…" : "Save formats"}
      </Button>
    </form>
  );
}
