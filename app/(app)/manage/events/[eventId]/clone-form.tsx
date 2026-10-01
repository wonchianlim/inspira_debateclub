"use client";

import { useActionState, useState } from "react";

import { FormMessage } from "@/components/domain/form-message";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cloneEventAction } from "@/lib/admin/event-actions";
import { INITIAL_FORM_STATE } from "@/lib/forms/form-state";

/**
 * 克隆活动。
 *
 * 刻意做成"要点开才显示"的形式：克隆会产生一个新活动，属于容易误触的操作。
 * 并且要求管理员**明确输入新活动的名称与开始时间**，而不是一键复制 ——
 * 一键复制很容易造出一堆忘记改时间的重复活动。
 *
 * 时区沿用原活动；其余时间点按"新开始时间与原开始时间的差值"整体平移。
 */
export function CloneEventForm({
  eventId,
  suggestedTitle,
  suggestedStartsAtLocal,
}: {
  eventId: string;
  suggestedTitle: string;
  suggestedStartsAtLocal: string;
}) {
  const [state, formAction, pending] = useActionState(cloneEventAction, INITIAL_FORM_STATE);
  const [open, setOpen] = useState(false);

  if (!open) {
    return (
      <div className="flex flex-col gap-3">
        <p className="text-muted-foreground text-sm">
          Create a new event from this one. Every time shifts with the new start, and the formats
          are copied. The new event is
          <strong>independent</strong> of the original; nothing is shared.
        </p>
        <Button
          type="button"
          variant="outline"
          className="self-start"
          onClick={() => setOpen(true)}
        >
          Duplicate this event
        </Button>
      </div>
    );
  }

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <input type="hidden" name="eventId" value={eventId} />
      <FormMessage status={state.status} message={state.message} />

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="clone-title">New event name</Label>
        <Input
          id="clone-title"
          name="title"
          defaultValue={suggestedTitle}
          required
          maxLength={120}
          disabled={pending}
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="clone-startsAtLocal">New start time (event time zone)</Label>
        <Input
          id="clone-startsAtLocal"
          name="startsAtLocal"
          type="datetime-local"
          defaultValue={suggestedStartsAtLocal}
          required
          disabled={pending}
        />
        <p className="text-muted-foreground text-xs">
          The other times - registration opens and closes, check-in, warning and end - shift by the
          same amount, so the relative schedule is unchanged. The new event starts as a draft.
        </p>
      </div>

      <div className="flex gap-2">
        <Button type="submit" disabled={pending}>
          {pending ? "Duplicating…" : "Duplicate event"}
        </Button>
        <Button type="button" variant="ghost" disabled={pending} onClick={() => setOpen(false)}>
          Cancel
        </Button>
      </div>
    </form>
  );
}
