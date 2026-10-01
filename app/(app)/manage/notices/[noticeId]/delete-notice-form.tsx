"use client";

import { useActionState } from "react";

import { FormMessage } from "@/components/domain/form-message";
import { Button } from "@/components/ui/button";
import { deleteNoticeAction } from "@/lib/admin/notice-actions";
import { INITIAL_FORM_STATE } from "@/lib/forms/form-state";

export function DeleteNoticeForm({ noticeId }: { noticeId: string }) {
  const [state, formAction, pending] = useActionState(deleteNoticeAction, INITIAL_FORM_STATE);

  return (
    <form action={formAction} className="flex flex-col gap-3">
      <input type="hidden" name="noticeId" value={noticeId} />
      <FormMessage status={state.status} message={state.message} />
      <p className="text-muted-foreground text-sm">
        Deleting removes it from the interface. The audit log keeps its full content and who deleted
        it, so deleting is not erasing the record.
      </p>
      <Button
        type="submit"
        variant="outline"
        disabled={pending}
        className="self-start"
        onClick={(event) => {
          if (!window.confirm("Delete this announcement?")) event.preventDefault();
        }}
      >
        {pending ? "Deleting…" : "Delete this announcement"}
      </Button>
    </form>
  );
}
