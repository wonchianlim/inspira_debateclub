"use client";

import { useActionState } from "react";

import { FormMessage } from "@/components/domain/form-message";
import { Button } from "@/components/ui/button";
import { INITIAL_FORM_STATE } from "@/lib/forms/form-state";
import { judgeCheckInAction, manualCheckInAction } from "@/lib/admin/check-in-actions";

/** 管理员代学生签到。 */
export function ManualCheckInButton({
  eventId,
  studentId,
  studentName,
}: {
  eventId: string;
  studentId: string;
  studentName: string;
}) {
  const [state, formAction, pending] = useActionState(manualCheckInAction, INITIAL_FORM_STATE);

  return (
    <form action={formAction} className="inline-flex flex-col gap-1">
      <input type="hidden" name="eventId" value={eventId} />
      <input type="hidden" name="studentId" value={studentId} />
      <Button type="submit" size="sm" variant="outline" disabled={pending}>
        {pending ? "…" : `给 ${studentName} 签到`}
      </Button>
      <FormMessage status={state.status} message={state.message} />
    </form>
  );
}

/** 裁判签到（管理员可代签）。 */
export function JudgeCheckInButton({ judgeId, label }: { judgeId: string; label: string }) {
  const [state, formAction, pending] = useActionState(judgeCheckInAction, INITIAL_FORM_STATE);

  return (
    <form action={formAction} className="inline-flex flex-col gap-1">
      <input type="hidden" name="judgeId" value={judgeId} />
      <Button type="submit" size="sm" variant="outline" disabled={pending}>
        {pending ? "…" : label}
      </Button>
      <FormMessage status={state.status} message={state.message} />
    </form>
  );
}
