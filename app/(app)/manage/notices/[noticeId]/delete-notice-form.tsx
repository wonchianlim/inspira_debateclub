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
        删除后这条通知会从界面上撤下。审计日志里仍会保留它的完整内容与删除者，
        因此「删除」不等于「抹掉痕迹」。
      </p>
      <Button
        type="submit"
        variant="outline"
        disabled={pending}
        className="self-start"
        onClick={(event) => {
          if (!window.confirm("确定要删除这条通知吗？")) event.preventDefault();
        }}
      >
        {pending ? "删除中…" : "删除这条通知"}
      </Button>
    </form>
  );
}
