"use client";

import { useActionState } from "react";

import { Button } from "@/components/ui/button";
import { INITIAL_FORM_STATE } from "@/lib/forms/form-state";
import { markNoticeReadAction } from "@/lib/notices/read-actions";

/** 把一条通知标为已读。已读的显示成状态而不是按钮。 */
export function MarkReadButton({ noticeId }: { noticeId: string }) {
  const [state, formAction, pending] = useActionState(markNoticeReadAction, INITIAL_FORM_STATE);

  return (
    <form action={formAction} className="flex items-center gap-2">
      <input type="hidden" name="noticeId" value={noticeId} />
      <Button type="submit" size="sm" variant="ghost" disabled={pending}>
        {pending ? "…" : "标记为已读"}
      </Button>
      {/* 失败也只在控制台之外说一句，不打断阅读 */}
      {state.status === "error" ? (
        <span className="text-destructive text-xs">{state.message}</span>
      ) : null}
    </form>
  );
}
